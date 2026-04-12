// Vercel Cron — 매달 말일 직원 평가 자동 실행
// vercel.json에 cron 스케줄 등록 필요
// 환경변수: CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 300, // 5분
};

export default async function handler(req) {
  // Cron 인증
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 마지막 날 체크
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (tomorrow.getDate() !== 1) {
    return new Response(JSON.stringify({ skipped: true, reason: 'Not last day of month' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // 전체 사용자 조회
  const { data: users } = await supabase.from('users').select('id');
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const results = [];

  for (const user of users || []) {
    try {
      const { data, error } = await supabase.functions.invoke('evaluate-employee', {
        body: { userId: user.id, month },
      });
      results.push({ userId: user.id, success: !error, grade: data?.grade });
    } catch (err) {
      results.push({ userId: user.id, success: false, error: String(err) });
    }
    // Rate limiting
    await new Promise((r) => setTimeout(r, 2000));
  }

  return new Response(JSON.stringify({ processed: results.length, month, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
