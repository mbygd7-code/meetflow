// Milo AI 설정 Zustand 스토어 — localStorage 영속화
import { create } from 'zustand';

const STORAGE_KEY = 'meetflow-milo-settings';

const DEFAULT_SETTINGS = {
  // 프리셋
  preset: 'default',

  // 역할
  role: '회의에 참여하는 조용하지만 날카로운 AI 팀원',
  roleDetail: '팀 회의에서 데이터 기반 인사이트를 제공하고, 논의를 구조화하며, 놓친 관점을 환기시키는 역할을 합니다.',

  // 성격
  personality: 'professional',       // professional | friendly | direct | creative
  tone: 'humble',                    // humble | neutral | assertive
  responseLength: 'concise',         // concise | moderate | detailed
  language: 'ko',                    // ko | en | auto

  // 능력 토글
  abilities: {
    dataAnalysis: true,              // 데이터 분석 & 근거 제시
    blindSpot: true,                 // 사각지대 환기
    timekeeping: true,               // 시간 관리 & 리마인더
    summarize: true,                 // 합의 정리 & 요약
    terminology: false,              // 전문 용어 설명
    pastReference: false,            // 과거 논의 연결
    taskExtraction: true,            // 후속 태스크 추출
    questionPrompt: false,           // 질문 유도 (논의 활성화)
  },

  // 전문 지식 분야
  expertise: [],                     // e.g. ['product', 'engineering', 'design', 'marketing', 'data']

  // 커스텀 지시사항
  customInstructions: '',

  // 금지 사항
  restrictions: [
    '특정인을 비판하거나 성과를 언급하지 않는다',
    '결정을 강요하지 않는다',
    '감정적 표현을 쓰지 않는다',
    '회의 주제와 무관한 잡담은 하지 않는다',
  ],

  // 업로드된 지식 파일 (MD 등)
  knowledgeFiles: [],                // [{ id, name, size, content, addedAt }]
};

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw);
    // 새로 추가된 필드 보존을 위해 defaults와 머지
    return { ...DEFAULT_SETTINGS, ...saved, abilities: { ...DEFAULT_SETTINGS.abilities, ...saved.abilities } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveToStorage(state) {
  try {
    // content가 큰 knowledgeFiles는 별도 처리 — 파일 내용 포함 저장
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[miloStore] localStorage save failed:', e);
  }
}

export const useMiloStore = create((set, get) => ({
  ...loadFromStorage(),

  // --- 액션 ---

  setPreset: (preset) => {
    set({ preset });
    saveToStorage(get());
  },

  setRole: (role) => {
    set({ role });
    saveToStorage(get());
  },

  setRoleDetail: (roleDetail) => {
    set({ roleDetail });
    saveToStorage(get());
  },

  setPersonality: (personality) => {
    set({ personality });
    saveToStorage(get());
  },

  setTone: (tone) => {
    set({ tone });
    saveToStorage(get());
  },

  setResponseLength: (responseLength) => {
    set({ responseLength });
    saveToStorage(get());
  },

  setLanguage: (language) => {
    set({ language });
    saveToStorage(get());
  },

  toggleAbility: (key) => {
    const abilities = { ...get().abilities, [key]: !get().abilities[key] };
    set({ abilities });
    saveToStorage(get());
  },

  setExpertise: (expertise) => {
    set({ expertise });
    saveToStorage(get());
  },

  setCustomInstructions: (customInstructions) => {
    set({ customInstructions });
    saveToStorage(get());
  },

  setRestrictions: (restrictions) => {
    set({ restrictions });
    saveToStorage(get());
  },

  addRestriction: (text) => {
    const restrictions = [...get().restrictions, text];
    set({ restrictions });
    saveToStorage(get());
  },

  removeRestriction: (index) => {
    const restrictions = get().restrictions.filter((_, i) => i !== index);
    set({ restrictions });
    saveToStorage(get());
  },

  // 지식 파일
  addKnowledgeFile: (file) => {
    const knowledgeFiles = [...get().knowledgeFiles, file];
    set({ knowledgeFiles });
    saveToStorage(get());
  },

  removeKnowledgeFile: (id) => {
    const knowledgeFiles = get().knowledgeFiles.filter((f) => f.id !== id);
    set({ knowledgeFiles });
    saveToStorage(get());
  },

  // 전체 리셋
  resetToDefaults: () => {
    set(DEFAULT_SETTINGS);
    saveToStorage(DEFAULT_SETTINGS);
  },

  // 설정 스냅샷 (프롬프트 빌드 용)
  getSnapshot: () => {
    const s = get();
    return {
      preset: s.preset,
      role: s.role,
      roleDetail: s.roleDetail,
      personality: s.personality,
      tone: s.tone,
      responseLength: s.responseLength,
      language: s.language,
      abilities: s.abilities,
      expertise: s.expertise,
      customInstructions: s.customInstructions,
      restrictions: s.restrictions,
      knowledgeFiles: s.knowledgeFiles,
    };
  },
}));
