"""Initial PostGIS schema migration for BhoomiSetu.

Revision ID: 0001_initial_postgis_schema
Revises: 
Create Date: 2026-09-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import geoalchemy2

# revision identifiers, used by Alembic.
revision: str = '0001_initial_postgis_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Enable PostGIS Extension
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")

    # 2. Table: roles
    op.create_table(
        'roles',
        sa.Column('id', sa.Integer(), sa.Identity(always=False), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_roles_name'), 'roles', ['name'], unique=True)

    # 3. Table: users
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role_id', sa.Integer(), nullable=False),
        sa.Column('full_name', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('district_jurisdiction', sa.String(length=100), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # 4. Table: projects
    op.create_table(
        'projects',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('project_type', sa.String(length=100), nullable=False),
        sa.Column('district', sa.String(length=100), nullable=False),
        sa.Column('total_parcels_target', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('acquisition_progress_pct', sa.Numeric(precision=5, scale=2), nullable=False, server_default='0.00'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='Planning'),
        sa.Column('target_completion_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_projects_code'), 'projects', ['code'], unique=True)
    op.create_index(op.f('ix_projects_district'), 'projects', ['district'], unique=False)

    # 5. Table: parcels
    op.create_table(
        'parcels',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('parcel_id', sa.String(length=50), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('survey_number', sa.String(length=100), nullable=False),
        sa.Column('state', sa.String(length=100), nullable=False, server_default='Bihar'),
        sa.Column('district', sa.String(length=100), nullable=False),
        sa.Column('land_area_ha', sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column('land_type', sa.String(length=100), nullable=False),
        sa.Column('land_use', sa.String(length=100), nullable=False),
        sa.Column('acquisition_status', sa.String(length=50), nullable=False, server_default='Identified'),

        # 19 ML Input Contract Fields
        sa.Column('land_value_inr', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('estimated_compensation_inr', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('number_of_owners', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('ownership_complexity_score', sa.Numeric(precision=4, scale=2), nullable=False, server_default='1.00'),
        sa.Column('previous_dispute_flag', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('previous_objections_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('environmental_risk_score', sa.Numeric(precision=4, scale=2), nullable=False, server_default='0.00'),
        sa.Column('road_accessibility_score', sa.Numeric(precision=4, scale=2), nullable=False, server_default='5.00'),
        sa.Column('distance_to_road_km', sa.Numeric(precision=6, scale=2), nullable=False, server_default='1.00'),
        sa.Column('stakeholder_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('land_use_conflict_score', sa.Numeric(precision=4, scale=2), nullable=False, server_default='0.00'),
        sa.Column('documentation_completeness_score', sa.Numeric(precision=4, scale=2), nullable=False, server_default='5.00'),
        sa.Column('historical_acquisition_duration_months', sa.Numeric(precision=5, scale=2), nullable=False, server_default='6.00'),

        # UI Demo Fields
        sa.Column('baseline_risk_score', sa.Numeric(precision=5, scale=2), nullable=True, server_default='50.00'),
        sa.Column('suitability_score', sa.Numeric(precision=5, scale=2), nullable=True, server_default='80.00'),
        sa.Column('estimated_delay_months', sa.Numeric(precision=4, scale=1), nullable=True, server_default='6.0'),

        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_parcels_parcel_id'), 'parcels', ['parcel_id'], unique=True)
    op.create_index(op.f('ix_parcels_project_id'), 'parcels', ['project_id'], unique=False)
    op.create_index(op.f('ix_parcels_district'), 'parcels', ['district'], unique=False)
    op.create_index(op.f('ix_parcels_acquisition_status'), 'parcels', ['acquisition_status'], unique=False)

    # 6. Table: parcel_owners
    op.create_table(
        'parcel_owners',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('parcel_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('owner_name', sa.String(length=150), nullable=False),
        sa.Column('share_percentage', sa.Numeric(precision=5, scale=2), nullable=False, server_default='100.00'),
        sa.Column('is_primary', sa.Boolean(), nullable=True, server_default=sa.text('true')),
        sa.Column('contact_phone', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['parcel_id'], ['parcels.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_parcel_owners_parcel_id'), 'parcel_owners', ['parcel_id'], unique=False)

    # 7. Table: parcel_geometries (PostGIS SRID 4326)
    op.create_table(
        'parcel_geometries',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('parcel_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('boundary', geoalchemy2.types.Geometry(geometry_type='POLYGON', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'), nullable=False),
        sa.Column('centroid', geoalchemy2.types.Geometry(geometry_type='POINT', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True),
        sa.Column('map_ui_x', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('map_ui_y', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['parcel_id'], ['parcels.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('parcel_id')
    )

    # 8. Table: disputes
    op.create_table(
        'disputes',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('dispute_code', sa.String(length=50), nullable=False),
        sa.Column('parcel_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('assigned_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('assigned_officer_name', sa.String(length=100), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='Under review'),
        sa.Column('priority', sa.String(length=20), nullable=False, server_default='MEDIUM'),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('filed_date', sa.Date(), nullable=False, server_default=sa.text('CURRENT_DATE')),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['assigned_user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['parcel_id'], ['parcels.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_disputes_dispute_code'), 'disputes', ['dispute_code'], unique=True)
    op.create_index(op.f('ix_disputes_parcel_id'), 'disputes', ['parcel_id'], unique=False)
    op.create_index(op.f('ix_disputes_project_id'), 'disputes', ['project_id'], unique=False)
    op.create_index(op.f('ix_disputes_status'), 'disputes', ['status'], unique=False)

    # 9. Table: compensation_records
    op.create_table(
        'compensation_records',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('record_code', sa.String(length=50), nullable=False),
        sa.Column('parcel_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('payee_name', sa.String(length=150), nullable=False),
        sa.Column('amount_inr', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='Pending approval'),
        sa.Column('approved_by_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('disbursed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['approved_by_user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['parcel_id'], ['parcels.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_compensation_records_record_code'), 'compensation_records', ['record_code'], unique=True)
    op.create_index(op.f('ix_compensation_records_parcel_id'), 'compensation_records', ['parcel_id'], unique=False)
    op.create_index(op.f('ix_compensation_records_project_id'), 'compensation_records', ['project_id'], unique=False)
    op.create_index(op.f('ix_compensation_records_status'), 'compensation_records', ['status'], unique=False)

    # 10. Table: documents
    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_code', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('parcel_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('storage_path', sa.String(length=500), nullable=False),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False, server_default='application/pdf'),
        sa.Column('verification_status', sa.String(length=50), nullable=False, server_default='Pending'),
        sa.Column('uploaded_by_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['parcel_id'], ['parcels.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.ForeignKeyConstraint(['uploaded_by_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_documents_document_code'), 'documents', ['document_code'], unique=True)
    op.create_index(op.f('ix_documents_parcel_id'), 'documents', ['parcel_id'], unique=False)
    op.create_index(op.f('ix_documents_project_id'), 'documents', ['project_id'], unique=False)

    # 11. Table: ai_analysis_results
    op.create_table(
        'ai_analysis_results',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('parcel_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('model_version', sa.String(length=50), nullable=False),
        sa.Column('acquisition_risk_class', sa.Integer(), nullable=False),
        sa.Column('risk_level', sa.String(length=20), nullable=False),
        sa.Column('risk_score', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('risk_probability', sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column('explanation_method', sa.String(length=50), nullable=False),
        sa.Column('shap_contributors', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('top_positive_contributors', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('top_negative_contributors', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('input_features_snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('is_current', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['parcel_id'], ['parcels.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ai_analysis_results_parcel_id'), 'ai_analysis_results', ['parcel_id'], unique=False)
    op.create_index(
        'idx_ai_current_results',
        'ai_analysis_results',
        ['parcel_id'],
        unique=False,
        postgresql_where=sa.text('is_current = true')
    )

    # 12. Table: audit_events
    op.create_table(
        'audit_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('event_code', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('entity_table', sa.String(length=50), nullable=False),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('parcel_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('actor_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('actor_name', sa.String(length=150), nullable=False),
        sa.Column('action_type', sa.String(length=50), nullable=False),
        sa.Column('prev_hash', sa.String(length=64), nullable=False),
        sa.Column('current_hash', sa.String(length=64), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['parcel_id'], ['parcels.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_events_event_code'), 'audit_events', ['event_code'], unique=True)
    op.create_index(op.f('ix_audit_events_parcel_id'), 'audit_events', ['parcel_id'], unique=False)
    op.create_index(op.f('ix_audit_events_project_id'), 'audit_events', ['project_id'], unique=False)


def downgrade() -> None:
    op.drop_table('audit_events')
    op.drop_table('ai_analysis_results')
    op.drop_table('documents')
    op.drop_table('compensation_records')
    op.drop_table('disputes')
    op.drop_table('parcel_geometries')
    op.drop_table('parcel_owners')
    op.drop_table('parcels')
    op.drop_table('projects')
    op.drop_table('users')
    op.drop_table('roles')
