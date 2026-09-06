"""Documents Object Storage & Metadata API routes (Phase 3.2)."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.documents import DocumentRecord
from app.models.parcels import Parcel
from app.models.projects import Project
from app.models.users import User
from app.schemas_v1 import DocumentCreate, DocumentResponse, PaginatedResponse
from app.services.audit_service import create_audit_event
from app.services.event_publisher import publish_system_event
from app.services.storage_service import get_storage_engine


router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=PaginatedResponse[DocumentResponse])
def get_documents(
    category: Optional[str] = Query(None, description="Filter by document category"),
    verification_status: Optional[str] = Query(None, description="Filter by verification status"),
    project: Optional[str] = Query(None, description="Filter by project code"),
    parcel: Optional[str] = Query(None, description="Filter by parcel ID"),
    search: Optional[str] = Query(None, description="Search document code or title"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedResponse[DocumentResponse]:
    """Retrieve paginated land acquisition document metadata with search and filters."""
    query = (
        db.query(DocumentRecord)
        .join(Project, DocumentRecord.project_id == Project.id)
        .outerjoin(Parcel, DocumentRecord.parcel_id == Parcel.id)
    )

    if category:
        query = query.filter(func.lower(DocumentRecord.category) == category.lower())

    if verification_status:
        query = query.filter(func.lower(DocumentRecord.verification_status) == verification_status.lower())

    if project:
        query = query.filter(func.lower(Project.code) == project.lower())

    if parcel:
        query = query.filter(func.lower(Parcel.parcel_id) == parcel.lower())

    if search:
        search_pattern = f"%{search.lower()}%"
        query = query.filter(
            or_(
                func.lower(DocumentRecord.document_code).like(search_pattern),
                func.lower(DocumentRecord.title).like(search_pattern),
            )
        )

    total = query.count()
    offset = (page - 1) * page_size
    docs = query.order_by(DocumentRecord.created_at.desc()).offset(offset).limit(page_size).all()

    items = []
    for d in docs:
        res = DocumentResponse.model_validate(d)
        res.parcel_id_str = d.parcel.parcel_id if d.parcel else None
        res.project_code = d.project.code if d.project else None
        items.append(res)

    return PaginatedResponse[DocumentResponse](
        items=items,
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def upload_document_file(
    file: UploadFile = File(...),
    title: str = Form(...),
    project_id: uuid.UUID = Form(...),
    category: str = Form(...),
    parcel_id: Optional[uuid.UUID] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["district_officer", "acquisition_officer", "legal_officer", "system_admin"])),
) -> DocumentResponse:
    """
    Multipart file upload endpoint.
    Saves file to Object Storage Engine (MinIO/Local), validates magic bytes & size, records DB metadata,
    and logs DOCUMENT_UPLOAD audit event. Includes transactional compensation rollback on failure.
    """
    # 1. Validate project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID '{project_id}' not found.",
        )

    # 2. Validate parcel if provided
    parcel = None
    if parcel_id:
        parcel = db.query(Parcel).filter(Parcel.id == parcel_id).first()
        if not parcel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parcel with ID '{parcel_id}' not found.",
            )

    # 3. Store file binary via Storage Engine (validates size, extension, magic bytes)
    engine = get_storage_engine()
    try:
        storage_key, file_size_bytes, clean_filename = engine.save_file(
            file_obj=file.file,
            filename=file.filename or "document.pdf",
            mime_type=file.content_type or "application/pdf",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage upload failure: {str(exc)}",
        ) from exc

    # 4. Insert DocumentRecord into DB + AuditEvent with Transactional Compensation Rollback
    doc_code = f"DOC-{uuid.uuid4().hex[:8].upper()}"
    doc = DocumentRecord(
        document_code=doc_code,
        title=title,
        parcel_id=parcel_id,
        project_id=project_id,
        category=category,
        storage_path=storage_key,
        file_size_bytes=file_size_bytes,
        mime_type=file.content_type or "application/pdf",
        verification_status="Verified",
        uploaded_by_user_id=current_user.id,
    )

    try:
        db.add(doc)
        db.flush()

        role_name = current_user.role.name if current_user.role else "officer"
        actor_name = f"{current_user.full_name} ({role_name})"
        create_audit_event(
            db=db,
            title=f"Document uploaded: {doc.document_code}",
            entity_table="documents",
            action_type="DOCUMENT_UPLOAD",
            payload={
                "document_code": doc.document_code,
                "title": doc.title,
                "category": doc.category,
                "file_size_bytes": doc.file_size_bytes,
                "storage_path": doc.storage_path,
                "project_code": project.code,
                "filename": clean_filename,
            },
            actor_name=actor_name,
            actor_user_id=current_user.id,
            entity_id=doc.id,
            parcel_id=doc.parcel_id,
            project_id=doc.project_id,
        )

        db.commit()
        db.refresh(doc)

        publish_system_event(
            event_type="DOCUMENT_UPLOAD",
            title=f"Document {doc.document_code} Uploaded",
            message=f"New document '{doc.title}' uploaded",
            data={
                "document_id": str(doc.id),
                "document_code": doc.document_code,
                "title": doc.title,
                "category": doc.category,
            },
            target_roles=["district_officer", "acquisition_officer", "legal_officer", "system_admin"],
        )

    except Exception as exc:
        db.rollback()
        # Compensation: Cleanup orphaned storage object if database transaction fails
        engine.delete_file(storage_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during document registration: {str(exc)}",
        ) from exc

    res = DocumentResponse.model_validate(doc)
    res.parcel_id_str = parcel.parcel_id if parcel else None
    res.project_code = project.code
    return res


@router.get("/{document_id}/download")
def download_document_file(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Authenticated streaming download endpoint.
    Retrieves object stream directly from Object Storage Engine and serves binary response with disposition headers.
    Logs DOCUMENT_DOWNLOAD audit event.
    """
    doc = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with ID '{document_id}' not found.",
        )

    engine = get_storage_engine()
    try:
        stream = engine.get_file_stream(doc.storage_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Physical document file not found in storage: {doc.storage_path}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Storage download failure: {str(exc)}",
        ) from exc

    # Log authenticated access in audit trail
    role_name = current_user.role.name if current_user.role else "officer"
    actor_name = f"{current_user.full_name} ({role_name})"
    create_audit_event(
        db=db,
        title=f"Document downloaded: {doc.document_code}",
        entity_table="documents",
        action_type="DOCUMENT_DOWNLOAD",
        payload={
            "document_code": doc.document_code,
            "title": doc.title,
            "category": doc.category,
        },
        actor_name=actor_name,
        actor_user_id=current_user.id,
        entity_id=doc.id,
        parcel_id=doc.parcel_id,
        project_id=doc.project_id,
    )
    db.commit()

    safe_filename = f"{doc.document_code}_{doc.title}".replace(" ", "_")
    return StreamingResponse(
        stream,
        media_type=doc.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


@router.delete("/{document_id}", status_code=status.HTTP_200_OK)
def delete_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["district_officer", "system_admin"])),
):
    """
    Delete document endpoint.
    Removes object from Object Storage Engine and deletes record from PostgreSQL database.
    Logs DOCUMENT_DELETE audit event.
    """
    doc = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with ID '{document_id}' not found.",
        )

    # 1. Delete physical object from Storage Engine
    engine = get_storage_engine()
    engine.delete_file(doc.storage_path)

    # 2. Create Audit Event & Delete DB record
    role_name = current_user.role.name if current_user.role else "officer"
    actor_name = f"{current_user.full_name} ({role_name})"
    create_audit_event(
        db=db,
        title=f"Document deleted: {doc.document_code}",
        entity_table="documents",
        action_type="DOCUMENT_DELETE",
        payload={
            "document_code": doc.document_code,
            "title": doc.title,
            "category": doc.category,
            "storage_path": doc.storage_path,
        },
        actor_name=actor_name,
        actor_user_id=current_user.id,
        entity_id=doc.id,
        parcel_id=doc.parcel_id,
        project_id=doc.project_id,
    )

    db.delete(doc)
    db.commit()

    return {"message": "Document deleted successfully", "id": str(document_id)}


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document_metadata(
    payload: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["district_officer", "acquisition_officer", "legal_officer", "system_admin"])),
) -> DocumentResponse:
    """Metadata-only registration route (backwards compatibility for integration tests)."""
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID '{payload.project_id}' not found.",
        )

    if payload.parcel_id:
        parcel = db.query(Parcel).filter(Parcel.id == payload.parcel_id).first()
        if not parcel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parcel with ID '{payload.parcel_id}' not found.",
            )

    existing = db.query(DocumentRecord).filter(DocumentRecord.document_code == payload.document_code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Document with code '{payload.document_code}' already exists.",
        )

    doc = DocumentRecord(
        document_code=payload.document_code,
        title=payload.title,
        parcel_id=payload.parcel_id,
        project_id=payload.project_id,
        category=payload.category,
        storage_path=payload.storage_path,
        file_size_bytes=payload.file_size_bytes,
        mime_type=payload.mime_type,
        verification_status=payload.verification_status,
        uploaded_by_user_id=current_user.id,
    )
    db.add(doc)
    db.flush()

    role_name = current_user.role.name if current_user.role else "officer"
    actor_name = f"{current_user.full_name} ({role_name})"
    create_audit_event(
        db=db,
        title=f"Document record {doc.document_code} registered",
        entity_table="documents",
        action_type="DOCUMENT_CREATE",
        payload={
            "document_code": doc.document_code,
            "title": doc.title,
            "category": doc.category,
            "verification_status": doc.verification_status,
            "file_size_bytes": doc.file_size_bytes,
            "storage_path": doc.storage_path,
            "project_code": project.code,
        },
        actor_name=actor_name,
        actor_user_id=current_user.id,
        entity_id=doc.id,
        parcel_id=doc.parcel_id,
        project_id=doc.project_id,
    )

    db.commit()
    db.refresh(doc)

    res = DocumentResponse.model_validate(doc)
    res.parcel_id_str = doc.parcel.parcel_id if doc.parcel else None
    res.project_code = doc.project.code if doc.project else None
    return res
