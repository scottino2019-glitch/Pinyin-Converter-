import { pinyin } from 'pinyin-pro';
import { ConversionOptions, Token } from '../types';

const TONES: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à', 'a'],
  o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
  e: ['ē', 'é', 'ě', 'è', 'e'],
  i: ['ī', 'í', 'ǐ', 'ì', 'i'],
  u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
  v: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
};

export function applyCaseStyle(py: string, caseStyle: 'lower' | 'upper' | 'capitalize'): string {
  if (!py) return py;
  if (caseStyle === 'upper') {
    return py.toUpperCase();
  }
  if (caseStyle === 'capitalize') {
    return py.charAt(0).toUpperCase() + py.slice(1).toLowerCase();
  }
  return py.toLowerCase();
}

export function tokenizeText(text: string, options: ConversionOptions): Token[] {
  if (!text) return [];

  const tokens: Token[] = [];
  // Match standard Chinese characters and extended CJK Unified Ideographs
  const chineseRegex = /[\u4e00-\u9fa5\u3400-\u4dbf\u{20000}-\u{2afff}]/u;
  
  let currentNonZh = '';
  let tokenIndex = 0;

  const flushNonZh = () => {
    if (currentNonZh) {
      if (options.nonZh === 'keep') {
        tokens.push({
          char: currentNonZh,
          isChinese: false,
          pinyin: '',
          allPinyins: [],
          isPolyphone: false,
          index: tokenIndex++,
        });
      }
      currentNonZh = '';
    }
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Handle surrogate pairs properly
    let fullChar = char;
    const codePoint = text.codePointAt(i);
    if (codePoint !== undefined && codePoint > 0xffff) {
      fullChar = String.fromCodePoint(codePoint);
      i++; // Skip next unit since it's part of the surrogate pair
    }

    if (chineseRegex.test(fullChar)) {
      flushNonZh();
      
      const py = pinyin(fullChar, {
        toneType: options.toneType,
        pattern: options.pattern,
        v: options.v,
      });

      const allPy = pinyin(fullChar, {
        multiple: true,
        type: 'array',
        toneType: options.toneType,
        pattern: options.pattern,
        v: options.v,
      });

      // Format initial default Pinyin and all alternate Pinyins
      const styledPinyin = applyCaseStyle(py, options.caseStyle);
      const styledAllPinyins = allPy.map(p => applyCaseStyle(p, options.caseStyle));

      tokens.push({
        char: fullChar,
        isChinese: true,
        pinyin: styledPinyin,
        allPinyins: Array.from(new Set(styledAllPinyins)), // Deduplicate casing outcomes
        isPolyphone: allPy.length > 1,
        index: tokenIndex++,
      });
    } else {
      currentNonZh += fullChar;
    }
  }
  
  flushNonZh();
  return tokens;
}

export function convertSyllableToSymbol(syllable: string): string {
  // Match a single syllable with a tone number (1-5) at the end, case-insensitive
  const match = syllable.match(/^([a-zA-ZüÜvV]+)([1-5])$/);
  if (!match) return syllable;

  const base = match[1];
  const toneNum = parseInt(match[2], 10);
  
  // Neutral tone (5) doesn't have marks
  if (toneNum === 5) {
    return base;
  }

  let vowelIndex = -1;
  let vowelChar = '';
  const lowerBase = base.toLowerCase();

  // Standard Pinyin Tone Marking Rules:
  // 1. If 'a' or 'e' is present, mark it.
  if (lowerBase.includes('a')) {
    vowelChar = 'a';
    vowelIndex = lowerBase.indexOf('a');
  } else if (lowerBase.includes('e')) {
    vowelChar = 'e';
    vowelIndex = lowerBase.indexOf('e');
  } 
  // 2. If 'o' is present, mark it.
  else if (lowerBase.includes('o')) {
    vowelChar = 'o';
    vowelIndex = lowerBase.indexOf('o');
  } 
  // 3. For 'ui' or 'iu', mark the second vowel.
  else if (lowerBase.includes('ui')) {
    vowelChar = 'i';
    vowelIndex = lowerBase.indexOf('ui') + 1;
  } else if (lowerBase.includes('iu')) {
    vowelChar = 'u';
    vowelIndex = lowerBase.indexOf('iu') + 1;
  } 
  // 4. Otherwise, look for the first vowel of i, u, ü, v.
  else {
    const vowels = ['i', 'u', 'ü', 'v'];
    for (const v of vowels) {
      if (lowerBase.includes(v)) {
        vowelChar = v;
        vowelIndex = lowerBase.indexOf(v);
        break;
      }
    }
  }

  if (vowelIndex === -1) {
    return base;
  }

  const isUpper = base[vowelIndex] === base[vowelIndex].toUpperCase();
  const vowelList = TONES[vowelChar.toLowerCase()];
  if (!vowelList) return base;

  let markedVowel = vowelList[toneNum - 1] || vowelChar;
  if (isUpper) {
    markedVowel = markedVowel.toUpperCase();
  }

  return base.substring(0, vowelIndex) + markedVowel + base.substring(vowelIndex + 1);
}

export function convertPinyinNumbersToSymbols(text: string): string {
  // Regex matches words/syllables followed by a tone number (1-5)
  const syllableRegex = /[a-zA-ZüÜvV\u00FC\u00DC]+[1-5]/g;
  return text.replace(syllableRegex, (match) => {
    return convertSyllableToSymbol(match);
  });
}

// Generate rubies HTML for the provided tokens
export function generateRubyHtml(tokens: Token[]): string {
  let htmlString = '<div class="pinyin-ruby-container" style="display: flex; flex-wrap: wrap; gap: 12px; font-family: system-ui, sans-serif;">\n';
  
  tokens.forEach(token => {
    if (token.isChinese) {
      htmlString += `  <ruby style="display: inline-flex; flex-direction: column-reverse; align-items: center; ruby-position: over;">\n`;
      htmlString += `    <span class="char" style="font-size: 24px; font-weight: 500;">${token.char}</span>\n`;
      htmlString += `    <rt class="pinyin" style="font-size: 12px; color: #4b5563; margin-bottom: 2px;">${token.pinyin}</rt>\n`;
      htmlString += `  </ruby>\n`;
    } else {
      // Clean non-Chinese token (escape HTML)
      const cleanText = token.char
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');
      htmlString += `  <span class="text" style="font-size: 24px; display: inline-block; align-self: flex-end; margin-bottom: 4px;">${cleanText}</span>\n`;
    }
  });
  
  htmlString += '</div>';
  return htmlString;
}
