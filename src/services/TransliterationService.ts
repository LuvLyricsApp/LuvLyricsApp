// @ts-ignore
const SanscriptLib = require('@indic-transliteration/sanscript');
const Sanscript = SanscriptLib.default || SanscriptLib;
import { LyricLine } from '../types/song';

// ============================================================================
// THE VIBE LAYER: COLLOQUIAL MAPPINGS
// ============================================================================
// "Project Phonetic" Dictionary
// Maps formal/robotic sounds to natural spoken Tamil (Tanglish)
const COLLOQUIAL_MAP: Record<string, string> = {
  // Suffixes (Morphology)
  'girathu': 'uthu',     // e.g. varugirathu -> varuthu
  'kirathu': 'kuthu',    // e.g. kerkirathu -> kerkuthu
  'kiren': 'ren',        // e.g. solkiren -> solren
  'giren': 'ren',
  'kirai': 'ra',        // e.g. pogirai -> pora
  'girai': 'ra',
  'avargal': 'anga',     // e.g. avargal -> avanga
  'argal': 'anga',       
  'vittu': 'tu',         // e.g. vanthuvittu -> vanthutu
  'kondiruk': 'kittiruk', // continuous tense shortcut
  
  // Common Words (Elision)
  'eppadi': 'epdi',
  'ippadi': 'ipdi',
  'appadi': 'apdi',
  'ennadi': 'endi',
  'ennada': 'enda',
  'kondal': 'konna',
  'vandhal': 'vantha',
  'sendral': 'pona', // semantic shift or phonological? sendral -> senna/pona. safely: sendra -> senna
  
  // Cultural/Vibe Fixes
  'tamizh': 'tamil',
  'thamizh': 'tamil',
  'nandri': 'nanri', // strict phonetic, user said avoid 'Thanks'
  'azhagu': 'azhagu', // Keep 'zh' for aesthetic words? Or 'alagu'? 'zh' is usually preferred style in Tanglish.
  'vanakkam': 'vanakkam',
};

export class TransliterationService {
    
    /**
     * Main pipeline: Tamil Script -> Colloquial Tanglish
     */
    static transliterate(lyrics: LyricLine[]): LyricLine[] {
        return lyrics.map(line => ({
            ...line,
            text: this.processLine(line.text)
        }));
    }

    private static processLine(text: string): string {
        if (!text.trim()) return text;

        // Step 1: Base Conversion (Academic)
        let raw = '';
        try {
            // console.log('[Transliteration] Base Input:', text);
            const academic = Sanscript.t(text, 'tamil', 'itrans_dravidian');
            // console.log('[Transliteration] Base Output:', academic);
            
            raw = academic;
        } catch (err) {
            if (__DEV__) console.error('[TransliterationService.processLine] Async error:', err);
            // Fallback: If Sanscript fails, return original text
            return text; 
        }

        // Step 2: Normalization (De-Formalize)
        // 1. Phonetical Mapping (ITRANS -> Readable English)
        raw = raw.replace(/t/g, 'th'); 
        raw = raw.replace(/T/g, 't'); 
        raw = raw.replace(/N/g, 'n');
        
        // Handle ITRANS artifacts
        raw = raw.replace(/~/g, 'n'); // ~n -> n (ஞ)
        raw = raw.replace(/\^/g, ''); // formatting artifacts
        raw = raw.replace(/[0-9]/g, ''); 
        
        // 2. Lowercase 
        raw = raw.toLowerCase();

        // Step 3: The "Vibe" Layer (Colloquial Replacement)
        const words = raw.split(/\s+/);
        const processedWords = words.map(w => {
            // Clean punctuation
            const pure = w.replace(/[^\w',.!?-]/g, ''); 
            // Check dictionary
            if (COLLOQUIAL_MAP[pure]) {
                return w.replace(pure, COLLOQUIAL_MAP[pure]);
            }
            
            // Apply suffix rules via regex on the word
            for (const [key, val] of Object.entries(COLLOQUIAL_MAP)) {
                if (pure.endsWith(key)) {
                    return w.replace(new RegExp(`${key}$`), val);
                }
            }
            
            return w;
        });

        return processedWords.join(' ');
    }
}
