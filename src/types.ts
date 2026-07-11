export interface ConversionOptions {
  toneType: 'symbol' | 'num' | 'none';
  pattern: 'pinyin' | 'initial' | 'final' | 'first';
  nonZh: 'keep' | 'remove';
  caseStyle: 'lower' | 'upper' | 'capitalize';
  v: boolean;
}

export interface Token {
  char: string;
  isChinese: boolean;
  pinyin: string;
  allPinyins: string[];
  isPolyphone: boolean;
  index: number;
}

export interface VocabularyItem {
  id: string;
  chinese: string;
  pinyin: string;
  addedAt: string;
  notes?: string;
}

export interface HistoryItem {
  id: string;
  chinese: string;
  pinyin: string;
  convertedAt: string;
}
