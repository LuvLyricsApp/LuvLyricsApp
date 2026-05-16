
// Mock the WhisperService to access the private parseWhisperResult method
// or we can just copy the logic here to test it in isolation if we can't easily instantiate the service without native modules.
// Since WhisperService relies on native modules, it's safer to extract the logic we want to test or mock the dependencies.

// However, we want to test the actual service method if possible. 
// Let's create a temporary test class that extends WhisperService to expose the private method,
// but we need to bypass the native module check in the constructor/initialization if there is one.
// Looking at the code, initialization is separate.

// Actually, simpler approach: I will create a standalone script that duplicates the `parseWhisperResult` logic 
// to verify the logic flaw, as running the actual service requires the native environment which might not be fully mocking-friendly in this script context.

const parseWhisperResult = (result: any) => {
    const segments: any[] = [];
    let fullText = '';
    
    // Noise regex (Strict matching)
    const NOISE_REGEX = /^(noise|machine|whirring|humming|brrr|clicking|silence|music|applause)$/i;
    
    if (result.segments && Array.isArray(result.segments)) {
      result.segments.forEach((segment: any, segmentIndex: number) => {
        const words: any[] = [];
        
        // Parse word-level timestamps
        if (segment.words && Array.isArray(segment.words)) {
          segment.words.forEach((wordData: any) => {
            const word = (wordData.word || wordData.text || '').trim();
            
            if (word.length > 0) {
              words.push({
                word,
                start: (wordData.t0 != null ? wordData.t0 / 100 : wordData.start || 0),
                end: (wordData.t1 != null ? wordData.t1 / 100 : wordData.end || 0),
                probability: wordData.p ?? wordData.probability ?? 0.8
              });
            }
          });
        } else {
          // Fallback: If no word-level data, estimate from segment
          const text = segment.text || '';
          const wordTexts = text.split(/\s+/).filter((w: string) => w.length > 0);
          const segmentStart = (segment.t0 != null ? segment.t0 / 100 : segment.start || 0);
          const segmentEnd = (segment.t1 != null ? segment.t1 / 100 : segment.end || 0);
          const duration = segmentEnd - segmentStart;
          const timePerWord = duration / Math.max(wordTexts.length, 1);
          
          console.log(`[WhisperService] Segment ${segmentIndex}: Estimating word timestamps`);
          
          wordTexts.forEach((wordText: string, index: number) => {
            const start = segmentStart + (index * timePerWord);
            const end = start + timePerWord;
            
            words.push({
              word: wordText.trim(),
              start,
              end,
              probability: 0.8
            });
          });
        }
        
        const segmentText = (segment.text || '').trim();
        
        // Filter out noise
        // 1. Remove bracketed content (e.g. [music], (applause))
        let cleanText = segmentText.replace(/\[.*?\]|\(.*?\)/g, '').trim();

        // 2. Check if remaining text is just noise keywords (STRICT MATCHING)
        let isNoise = NOISE_REGEX.test(cleanText);
        
        // 3. RECOVERY: If cleanText is empty but we have words, try to reconstruct text from words
        if (cleanText.length === 0 && words.length > 0) {
             const reconstructed = words.map(w => w.word).join(' ').trim();
             if (reconstructed.length > 0 && !NOISE_REGEX.test(reconstructed)) {
                 cleanText = reconstructed;
                 isNoise = false;
                 console.log(`[WhisperService] Recovered text from words: "${cleanText}"`);
             }
        }
        
        console.log(`Segment ${segmentIndex}: text="${segmentText}", clean="${cleanText}", isNoise=${isNoise}, wordsFound=${words.length}`);

        if (cleanText.length > 0 && !isNoise) {
          segments.push({
            text: cleanText,
            start: (segment.t0 != null ? segment.t0 / 100 : segment.start || 0),
            end: (segment.t1 != null ? segment.t1 / 100 : segment.end || 0),
            words
          });
          
          fullText += cleanText + ' ';
        } else {
             console.log(`WARNING: Segment ${segmentIndex} discarded! (clean="${cleanText}")`);
        }
      });
    }
    
    return { segments, fullText };
};

// Simulation Data: A segment that looks like noise but isn't, or has brackets
const mockResult = {
    segments: [
        {
            text: " [Verse 1] ",
            t0: 1000,
            t1: 1500,
            // No words array, forcing fallback
        },
        {
            text: " [Music] ", // Should be discarded
            t0: 1500,
            t1: 2000,
        },
        {
            text: "(Applause) Thank you", // Should keep "Thank you"
            t0: 2000,
            t1: 2500,
        },
        {
             text: "[Instrumental Break]", // Should be discarded
             t0: 2500,
             t1: 3000
        },
        {
            text: "   ", // Empty segment
            t0: 3000,
            t1: 3500
        }
    ]
};

console.log("Running Parsing Simulation...");
const parsed = parseWhisperResult(mockResult);
console.log("Parsed Segments:", parsed.segments.length);
console.log("Total Words:", parsed.segments.reduce((sum, s) => sum + s.words.length, 0));

if (parsed.segments.length === 0) {
    console.error("FAIL: No segments parsed!");
} else if (parsed.segments.length < 2) {
     console.error("FAIL: Missing segments due to aggressive filtering!");
} else {
    console.log("SUCCESS: Segments parsed correctly.");
}
