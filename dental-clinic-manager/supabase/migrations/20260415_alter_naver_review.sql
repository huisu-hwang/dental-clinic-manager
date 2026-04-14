-- 1. gift_logs 테이블의 naver_review 컬럼에 걸려있는 제약조건(CHECK) 동적 삭제
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
         SELECT conname
         FROM pg_constraint
         INNER JOIN pg_attribute ON attrelid = conrelid AND attnum = ANY(conkey)
         WHERE conrelid = 'gift_logs'::regclass AND attname = 'naver_review' AND contype = 'c'
    ) LOOP
         EXECUTE 'ALTER TABLE gift_logs DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- 2. naver_review 컬럼 데이터 타입 변경 (문자열 길이를 20으로 늘림)
ALTER TABLE gift_logs ALTER COLUMN naver_review TYPE VARCHAR(20);

-- 3. 기존 'X'와 'O' 데이터를 새로운 분류인 '미작성'과 '네이버'로 변환
UPDATE gift_logs SET naver_review = '미작성' WHERE naver_review = 'X';
UPDATE gift_logs SET naver_review = '네이버' WHERE naver_review = 'O';
