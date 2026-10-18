"""create user memories table

Revision ID: 174308e90daf
Revises: 11ff1fcf843c
Create Date: 2026-10-18 17:24:48.210475

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '174308e90daf'
down_revision: Union[str, Sequence[str], None] = '11ff1fcf843c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    op.create_table(
        "user_memories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "category",
            sa.String(length=50),
            server_default="general",
            nullable=False,
        ),
        sa.Column(
            "source",
            sa.String(length=20),
            server_default="explicit",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_user_memories_user_id",
        "user_memories",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_user_memories_user_id",
        table_name="user_memories",
    )
    op.drop_table("user_memories")
