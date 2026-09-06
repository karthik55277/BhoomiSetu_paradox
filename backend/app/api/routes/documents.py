"""Documents Metadata API routes."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.documents import DocumentRecord
from app.models.parcels import Parcel
from app.models.projects import Project
from app.schemas_v1 import DocumentCreate, DocumentResponse, PaginatedResponse

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


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document_metadata(
    payload: DocumentCreate,
    db: Session = Depends(get_db),
) -> DocumentResponse:
    """Create document metadata record (Phase 2.3 metadata only, no physical file storage)."""
    # Verify project exists
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID '{payload.project_id}' not found.",
        )

    # Verify parcel if provided
    if payload.parcel_id:
        parcel = db.query(Parcel).filter(Parcel.id == payload.parcel_id).first()
        if not parcel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parcel with ID '{payload.parcel_id}' not found.",
            )

    # Check for duplicate document_code
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
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    res = DocumentResponse.model_validate(doc)
    res.parcel_id_str = doc.parcel.parcel_id if doc.parcel else None
    res.project_code = doc.project.code if doc.project else None
    return res
