import { Pool } from 'pg';

// Vercel 환경 변수에서 데이터베이스 URL을 가져옵니다.
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL 환경 변수가 설정되지 않았습니다.');
}

// 데이터베이스 연결 풀을 생성합니다.
const pool = new Pool({
  connectionString: databaseUrl,
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};
