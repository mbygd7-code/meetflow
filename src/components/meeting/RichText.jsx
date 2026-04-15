import { Fragment } from 'react';
import {
  CheckCircle2, AlertTriangle, BarChart3, Target,
  Lightbulb, Star, Bookmark, ArrowRight, Zap,
} from 'lucide-react';
import ReferenceBadge from './ReferenceBadge';

// 이모지 → Lucide 아이콘 매핑
const EMOJI_MAP = [
  { pattern: /✅/g, icon: CheckCircle2, color: 'text-status-success' },
  { pattern: /☑️/g, icon: CheckCircle2, color: 'text-status-success' },
  { pattern: /⚠️/g, icon: AlertTriangle, color: 'text-brand-yellow' },
  { pattern: /📊/g, icon: BarChart3, color: 'text-brand-purple' },
  { pattern: /📈/g, icon: BarChart3, color: 'text-status-success' },
  { pattern: /📉/g, icon: BarChart3, color: 'text-status-error' },
  { pattern: /🎯/g, icon: Target, color: 'text-brand-orange' },
  { pattern: /💡/g, icon: Lightbulb, color: 'text-brand-yellow' },
  { pattern: /⭐/g, icon: Star, color: 'text-brand-yellow' },
  { pattern: /🔖/g, icon: Bookmark, color: 'text-brand-purple' },
  { pattern: /👉/g, icon: ArrowRight, color: 'text-brand-purple' },
  { pattern: /⚡/g, icon: Zap, color: 'text-brand-yellow' },
  { pattern: /❌/g, icon: null, text: '' },
  { pattern: /✔️/g, icon: CheckCircle2, color: 'text-status-success' },
];

// 인라인 파싱: **bold**, (Art. X), 이모지 → React 엘리먼트
function parseInline(text, keyPrefix = '') {
  if (!text) return null;

  // 통합 정규식: **bold** | [링크](URL) | @멘션 | (Art. X) | 이모지
  const emojiChars = EMOJI_MAP.map((e) => e.pattern.source).join('|');
  const inlineRegex = new RegExp(
    `(\\*\\*(.+?)\\*\\*)|` +                          // **bold**
    `(\\[([^\\]]+)\\]\\((https?:\\/\\/[^)]+)\\))|` +  // [텍스트](URL)
    `(@[\\u3131-\\uD79D\\w]+(?:님)?)` +               // @멘션 (@명배영, @명배영님)
    `|(\\(?Art\\.\\s*\\d+(?:\\(\\d+\\))?\\)?)` +      // (Art. X) or Art. X
    `|(${emojiChars})`,                                // emojis
    'g'
  );

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    // 앞선 일반 텍스트
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(
        <strong key={`${keyPrefix}b${match.index}`} className="font-semibold text-txt-primary">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // [텍스트](URL) — 링크
      parts.push(
        <a
          key={`${keyPrefix}l${match.index}`}
          href={match[5]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-purple underline underline-offset-2 hover:text-brand-orange transition-colors"
        >
          {match[4]}
        </a>
      );
    } else if (match[6]) {
      // @멘션 — 하이라이트
      parts.push(
        <span key={`${keyPrefix}m${match.index}`} className="text-brand-purple font-semibold">
          {match[6]}
        </span>
      );
    } else if (match[7]) {
      // (Art. X) — 참조 뱃지
      const refText = match[7].replace(/^\(|\)$/g, '').trim();
      parts.push(
        <ReferenceBadge key={`${keyPrefix}r${match.index}`} reference={refText} />
      );
    } else {
      // 이모지 → 아이콘
      const emoji = match[0];
      const mapping = EMOJI_MAP.find((e) => emoji.match(e.pattern));
      if (mapping) {
        if (mapping.icon) {
          const Icon = mapping.icon;
          parts.push(
            <Icon
              key={`${keyPrefix}e${match.index}`}
              size={14}
              strokeWidth={2.2}
              className={`${mapping.color} inline-block align-text-bottom mx-0.5`}
            />
          );
        } else if (mapping.text !== undefined) {
          parts.push(mapping.text);
        }
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // 나머지 텍스트
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// 줄 타입 판별
function classifyLine(line) {
  if (/^\s*[-•]\s+/.test(line)) return { type: 'bullet', content: line.replace(/^\s*[-•]\s+/, '') };
  if (/^\s*\d+\.\s+/.test(line)) {
    const m = line.match(/^\s*(\d+)\.\s+(.*)/);
    return { type: 'numbered', num: m[1], content: m[2] };
  }
  return { type: 'text', content: line };
}

// 연속 리스트 그룹핑
function groupLines(lines) {
  const groups = [];
  let currentGroup = null;

  for (let i = 0; i < lines.length; i++) {
    const classified = classifyLine(lines[i]);

    if (classified.type === 'bullet') {
      if (!currentGroup || currentGroup.type !== 'bullet') {
        currentGroup = { type: 'bullet', items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(classified.content);
    } else if (classified.type === 'numbered') {
      if (!currentGroup || currentGroup.type !== 'numbered') {
        currentGroup = { type: 'numbered', items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push({ num: classified.num, content: classified.content });
    } else {
      currentGroup = null;
      groups.push({ type: 'text', content: classified.content });
    }
  }

  return groups;
}

export default function RichText({ content }) {
  if (!content) return null;

  const lines = content.split('\n');
  const groups = groupLines(lines);

  return (
    <div className="space-y-1.5">
      {groups.map((group, gi) => {
        if (group.type === 'bullet') {
          return (
            <div key={gi} className="ml-1 space-y-0.5 my-2">
              {group.items.map((item, ii) => (
                <div
                  key={ii}
                  className="flex gap-2 pl-2 py-0.5 text-sm leading-relaxed"
                >
                  <span className="text-txt-primary/70 shrink-0 mt-px select-none">&#8226;</span>
                  <span className="flex-1">{parseInline(item, `${gi}-${ii}-`)}</span>
                </div>
              ))}
            </div>
          );
        }

        if (group.type === 'numbered') {
          return (
            <div key={gi} className="ml-1 space-y-0.5 my-2">
              {group.items.map((item, ii) => (
                <div
                  key={ii}
                  className="flex gap-1.5 pl-2 py-0.5 text-sm leading-relaxed"
                >
                  <span className="text-txt-primary/70 shrink-0 select-none">{item.num}.</span>
                  <span className="flex-1">{parseInline(item.content, `${gi}-${ii}-`)}</span>
                </div>
              ))}
            </div>
          );
        }

        // 일반 텍스트 줄
        if (!group.content?.trim()) {
          return <div key={gi} className="h-1.5" />;
        }

        return (
          <div key={gi} className="text-sm leading-relaxed">
            {parseInline(group.content, `${gi}-`)}
          </div>
        );
      })}
    </div>
  );
}
