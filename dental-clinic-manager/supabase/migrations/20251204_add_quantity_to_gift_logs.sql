-- ============================================================================
-- Migration: Add quantity column to gift_logs table
-- Created: 2025-12-04
-- Purpose: gift_logs 테이블에 선물 수량(quantity) 컬럼 추가
-- ============================================================================

-- Add quantity column with default value of 1
ALTER TABLE gift_logs
ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- Add comment for the column
COMMENT ON COLUMN gift_logs.quantity IS '선물 수량 (기본값: 1)';

-- Verify the column was added
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'gift_logs' AND column_name = 'quantity'
    ) THEN
        RAISE NOTICE 'Successfully added quantity column to gift_logs table';
    ELSE
        RAISE EXCEPTION 'Failed to add quantity column to gift_logs table';
    END IF;
END $$;
