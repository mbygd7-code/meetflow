// Supabase Edge Function — Milo AI 분석
// Deploy: supabase functions deploy milo-analyze
//
// POST body: { messages, agenda, preset, context }
// Returns: { should_respond, response_text, ai_type, suggested_tasks? }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.30.0';

const MILO_SYSTEM_PROMPT = `당신은 MeetFlow의 AI 팀원 "Milo"입니다.

역할: 회의에 참여하는 조용하지만 날카로운 동료
원칙:
1. 최소 개입 — 필요한 순간에만 한마디
2. 의견이 아닌 정보 — "~라는 데이터가 있어요"
3. 겸손한 톤 — "참고로~", "검토해볼 만합니다"
4. 투명한 출처 — 데이터 인용 시 반드시 출처 명시
5. 침묵도 선택지

개입 시점: 데이터 근거 / 사각지대 / 시간 초과 / 결정 확인 / 용어 설명 / 과거 연결
금지: 특정인 비판, 성과 언급, 결정 강요, 감정적 표현
응답: 한국어, 최대 3-4문장 (@호출 시 5-8문장)

반드시 다음 JSON 스키마로만 응답:
{
  "should_respond": boolean,
  "response_text": string,
  "ai_type": "data" | "insight" | "question" | "summary" | "nudge",
  "suggested_tasks": [{ "title": string, "priority": "low"|"medium"|"high"|"urgent" }]
}`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── 시트 데이터 캐시 (5분) ──
const sheetsCache: Record<string, { data: string; ts: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5분

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages, agenda, preset, context, miloSettings, compressedContext, googleDocsSummary } = await req.json();

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const transcript = (messages || [])
      .slice(-15)
      .map((m: any) => `[${m.user?.name || (m.is_ai ? 'Milo' : '참가자')}] ${m.content}`)
      .join('\n');

    // 미리 요약된 Google 문서 데이터 (클라이언트에서 동기화됨)
    let sheetsSection = '';
    if (googleDocsSummary) {
      sheetsSection = `## 참조 데이터 (사전 동기화)\n이 데이터는 실제 DB/문서에서 동기화된 것입니다. 이 수치를 근거로 답변하세요.\n\n${googleDocsSummary}\n\n`;
    }
    // 아래 기존 시트 fetch 로직은 비활성 (미리 요약 방식으로 대체)
    if (false) { let _unused = '';
    // 배열 지원: [{id, type, label}] 또는 [{id, label}] 또는 [string] 또는 단일 string
    const docEntries: { id: string; type: string; label: string }[] = [];
    if (googleSheetsId) {
      const raw = Array.isArray(googleSheetsId) ? googleSheetsId : [googleSheetsId];
      for (const item of raw) {
        if (typeof item === 'string') docEntries.push({ id: item, type: 'sheets', label: '' });
        else if (item?.id) docEntries.push({ id: item.id, type: item.type || 'sheets', label: item.label || '' });
      }
    }
    if (docEntries.length > 0) {
      try {
        const sheetsApiKey = Deno.env.get('GOOGLE_SHEETS_API_KEY');
        if (sheetsApiKey) {
          const allSheetSummaries: string[] = [];

          // ── Google Docs fetch (캐시 적용) ──
          for (const entry of docEntries.filter(e => e.type === 'docs').slice(0, 3)) {
            const cacheKey = `docs:${entry.id}`;
            const cached = sheetsCache[cacheKey];
            if (cached && Date.now() - cached.ts < CACHE_TTL) {
              allSheetSummaries.push(cached.data);
              continue;
            }
            try {
              const ctrl = new AbortController();
              const timeout = setTimeout(() => ctrl.abort(), 5000);
              const docsRes = await fetch(
                `https://docs.google.com/document/d/${entry.id}/export?format=txt`,
                { signal: ctrl.signal }
              );
              clearTimeout(timeout);
              if (docsRes.ok) {
                let text = await docsRes.text();
                if (text.length > 8000) {
                  text = text.slice(0, 4000) + '\n\n... (중간 생략) ...\n\n' + text.slice(-4000);
                }
                const labelTag = entry.label ? ` — ${entry.label}` : '';
                const result = `### Google Docs${labelTag}\n${text}`;
                sheetsCache[cacheKey] = { data: result, ts: Date.now() };
                allSheetSummaries.push(result);
              }
            } catch (e) {
              console.error('[milo-analyze] Docs fetch error:', e);
            }
          }

          // ── Google Sheets fetch (캐시 적용) ──
          for (const entry of docEntries.filter(e => e.type !== 'docs').slice(0, 5)) {
          const sheetId = entry.id;
          const sheetLabel = entry.label;
          const cacheKey = `sheets:${sheetId}`;
          const cachedSheet = sheetsCache[cacheKey];
          if (cachedSheet && Date.now() - cachedSheet.ts < CACHE_TTL) {
            allSheetSummaries.push(cachedSheet.data);
            continue;
          }
          const ctrl = new AbortController();
          const sheetTimeout = setTimeout(() => ctrl.abort(), 5000);
          const metaRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title&key=${sheetsApiKey}`,
            { signal: ctrl.signal }
          ).catch(() => null);
          clearTimeout(sheetTimeout);
          if (metaRes?.ok) {
            const meta = await metaRes.json();
            const sheetNames = (meta.sheets || []).map((s: any) => s.properties.title).slice(0, 5);

            const summaries: string[] = [];
            for (const name of sheetNames) {
              const sheetsRes = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetsId}/values/${encodeURIComponent(name)}?key=${sheetsApiKey}`
              );
              if (!sheetsRes.ok) continue;
              const sheetsData = await sheetsRes.json();
              const allRows = sheetsData.values || [];
              if (allRows.length < 2) continue;

              // 헤더 행 자동 감지: 1행에 빈 셀이 많으면 2행을 헤더로 사용
              let headerRowIdx = 0;
              const row0filled = (allRows[0] || []).filter((c: string) => c && c.trim()).length;
              const row1filled = allRows.length > 1 ? (allRows[1] || []).filter((c: string) => c && c.trim()).length : 0;
              if (row0filled <= 2 && row1filled > row0filled) {
                headerRowIdx = 1; // 1행은 타이틀, 2행이 실제 헤더
              }

              const headers = allRows[headerRowIdx];
              const dataRows = allRows.slice(headerRowIdx + 1);
              const totalRows = dataRows.length;

              // ── 헤더 인덱스 매핑 (유연하게) ──
              const hIdx: Record<string, number> = {};
              headers.forEach((h: string, i: number) => { hIdx[(h || '').trim().toLowerCase()] = i; });
              const col = (name: string) => {
                const idx = hIdx[name.toLowerCase()];
                return idx !== undefined ? idx : -1;
              };
              const getCol = (row: string[], colName: string) => {
                const idx = col(colName);
                return idx >= 0 ? (row[idx] || '').trim() : '';
              };

              // ── 분포 계산 헬퍼 ──
              const distribution = (colName: string, limit = 10) => {
                const idx = col(colName);
                if (idx < 0) return null;
                const freq: Record<string, number> = {};
                dataRows.forEach((r: string[]) => {
                  const v = (r[idx] || '').trim();
                  if (v) freq[v] = (freq[v] || 0) + 1;
                });
                const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
                return {
                  total: sorted.reduce((a, b) => a + b[1], 0),
                  unique: sorted.length,
                  top: sorted.slice(0, limit).map(([k, v]) => `${k}: ${v.toLocaleString()}명(${(v / totalRows * 100).toFixed(1)}%)`),
                };
              };

              // ── 비즈니스 KPI 계산 ──
              const kpis: string[] = [];
              kpis.push(`**총 데이터 수: ${totalRows.toLocaleString()}건** (${headers.length}개 열)`);

              // 주요 분포 열 자동 감지 + 계산
              const importantCols = ['가입구분', '회원구분', '직업', '연령대', '성별', '결제유형', '상품유형', '학교유형', '시도', '근무지역'];
              for (const colName of importantCols) {
                const dist = distribution(colName);
                if (dist && dist.unique > 0) {
                  kpis.push(`\n**${colName}별 분포** (${dist.unique}개 유형):`);
                  dist.top.forEach((line) => kpis.push(`  - ${line}`));
                }
              }

              // 숫자 열 통계 (보유크레딧 등)
              const numericCols = ['보유크레딧'];
              for (const colName of numericCols) {
                const idx = col(colName);
                if (idx < 0) continue;
                const nums = dataRows.map((r: string[]) => Number((r[idx] || '0').replace(/,/g, ''))).filter((n: number) => !isNaN(n) && isFinite(n));
                if (nums.length > 0) {
                  const sum = nums.reduce((a: number, b: number) => a + b, 0);
                  const avg = sum / nums.length;
                  kpis.push(`\n**${colName} 통계**: 합계=${sum.toLocaleString()}, 평균=${avg.toFixed(0)}, 최대=${Math.max(...nums).toLocaleString()}`);
                }
              }

              // 나머지 열도 요약 (상위 3개만)
              const coveredCols = new Set([...importantCols, ...numericCols, 'no', '아이디', '이름', '이메일', '생년월일', '닉네임', '통합id', '주소1', '주소2']);
              for (let c = 0; c < Math.min(headers.length, 26); c++) {
                const h = (headers[c] || '').trim();
                if (!h || coveredCols.has(h)) continue;
                const dist = distribution(h, 3);
                if (dist && dist.unique > 0 && dist.unique < totalRows * 0.8) {
                  kpis.push(`\n**${h}**: ${dist.unique}개 유형 — ${dist.top.slice(0, 3).join(', ')}`);
                }
              }

              // 최근 15행 샘플 (태스크/일정형 시트에서 유용)
              if (totalRows <= 200) {
                // 200행 이하면 전체 포함 (태스크 시트 등)
                const sampleH = headers.slice(0, 10).map((h: string) => (h || '').slice(0, 30));
                const sampleDiv = sampleH.map(() => '---');
                const sampleD = dataRows.slice(0, 200).map((r: string[]) =>
                  r.slice(0, 10).map((c: string) => (c || '').slice(0, 60))
                );
                kpis.push(`\n**전체 데이터:**\n| ${sampleH.join(' | ')} |\n| ${sampleDiv.join(' | ')} |\n` +
                  sampleD.map((r: string[]) => `| ${r.join(' | ')} |`).join('\n'));
              } else {
                // 대용량이면 최근 15행만
                const sampleH = headers.slice(0, 8).map((h: string) => (h || '').slice(0, 25));
                const sampleDiv = sampleH.map(() => '---');
                const recent = dataRows.slice(0, 15).map((r: string[]) =>
                  r.slice(0, 8).map((c: string) => (c || '').slice(0, 40))
                );
                kpis.push(`\n**최근 15건 샘플:**\n| ${sampleH.join(' | ')} |\n| ${sampleDiv.join(' | ')} |\n` +
                  recent.map((r: string[]) => `| ${r.join(' | ')} |`).join('\n'));
              }

              const labelTag = sheetLabel ? ` — ${sheetLabel}` : '';
              summaries.push(`### ${name}${labelTag} (실시간 KPI)\n${kpis.join('\n')}`);
            }
            if (summaries.length > 0) {
              const combined = summaries.join('\n\n');
              sheetsCache[cacheKey] = { data: combined, ts: Date.now() };
              allSheetSummaries.push(combined);
            }
          } else {
            if (metaRes) console.error('[milo-analyze] Sheets meta error:', metaRes.status);
          }
          } // end for sheetId loop
          if (allSheetSummaries.length > 0) {
            sheetsSection = `## 참조 스프레드시트 데이터 (실시간 분석)\n이 데이터는 실제 DB에서 실시간으로 집계한 것입니다. 이 수치를 근거로 답변하세요.\n\n${allSheetSummaries.join('\n\n')}\n\n`;
          }
        }
      } catch (e) {
        console.error('[milo-analyze] Sheets fetch error:', e);
      }
    } // end if(false) — 기존 시트 fetch 비활성

    // 참가자 목록 (AI가 @멘션할 수 있도록)
    const participantList = (context?.participants || []).length > 0
      ? `## 회의 참가자 (실제 사람)\n${context.participants.map((n: string) => `- ${n}`).join('\n')}\n`
      : '';

    // 압축된 이전 컨텍스트
    const compressedSection = compressedContext
      ? `## 이전 논의 요약 (압축)\n${compressedContext}\n\n`
      : '';

    const userPrompt = `## 현재 어젠다
${agenda?.title || '미지정'} (${agenda?.duration_minutes || 10}분)

${participantList}${compressedSection}${sheetsSection}## 최근 대화
${transcript}

## 프리셋
${preset || 'default'}

## 도메인 넘김 규칙 (중요!)
- 자신의 전문 분야가 아닌 질문은 해당 전문가에게 넘겨라
- 비주얼/이미지/디자인 → "노먼에게 확인해보겠습니다"
- 법률/개인정보 → "코르프에게 확인해보겠습니다"
- 데이터/지표 → "데밍에게 확인해보겠습니다"
- 마케팅/브랜드 → "코틀러에게 확인해보겠습니다"
- 교육/보육 → "프뢰벨에게 확인해보겠습니다"
- 자신의 전문 분야만 간단히 코멘트하고 전문가 이름을 반드시 언급하여 넘겨라

## 과제
위 대화 흐름을 검토하고 Milo가 개입할지 판단하라. 개입이 필요하면 짧은 코멘트만 작성 (3~4문장).
@Milo 직접 호출이 있다면 반드시 응답 (5~8문장).
참가자에게 질문할 때 반드시 @이름 형식으로 멘션하라 (예: "@명배영님, ...").
응답이 필요 없다면 should_respond=false.`;

    // miloSettings에서 커스텀 시스템 프롬프트 / 모델 지원
    const systemPrompt = miloSettings?.systemPromptOverride || MILO_SYSTEM_PROMPT;
    const model = miloSettings?.apiModelId || 'claude-sonnet-4-20250514';

    const JSON_FORMAT_INSTRUCTION = `\n\n## 응답 형식 (반드시 준수)\n반드시 순수 JSON만 응답하세요. 마크다운이나 설명 텍스트를 포함하지 마세요.\nresponse_text에는 회의 참가자에게 보여줄 깔끔한 메시지만 작성하세요.\n{\n  "should_respond": boolean,\n  "response_text": "회의 참가자에게 보여줄 깔끔한 응답 메시지",\n  "ai_type": "data" | "insight" | "question" | "summary" | "nudge"\n}`;

    const response = await anthropic.messages.create({
      model,
      max_tokens: 600,
      system: systemPrompt + JSON_FORMAT_INSTRUCTION,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b: any) => b.type === 'text');
    const raw = textBlock?.text || '{}';

    // JSON 추출
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { should_respond: false };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[milo-analyze]', err);
    return new Response(
      JSON.stringify({ error: String(err), should_respond: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
