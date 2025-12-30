
/**
 * Checks if a code has more than 3 identical consecutive digits.
 */
const isValidConsecutive = (code: string[]): boolean => {
  if (code.length < 4) return true;
  for (let i = 0; i <= code.length - 4; i++) {
    if (
      code[i] === code[i + 1] &&
      code[i] === code[i + 2] &&
      code[i] === code[i + 3]
    ) {
      return false;
    }
  }
  return true;
};

/**
 * Checks if all digits are identical.
 */
const isNotAllSame = (code: string[]): boolean => {
  return !code.every(digit => digit === code[0]);
};

/**
 * Generates a valid 7-digit code that is unique compared to usedCodes.
 */
export const generateValidCode = (length: number, usedCodes: Set<string>): string[] => {
  let attempts = 0;
  const maxAttempts = 1000; // Safety break

  while (attempts < maxAttempts) {
    const code = Array.from({ length }, () => Math.floor(Math.random() * 10).toString());
    const codeStr = code.join('');
    
    if (isNotAllSame(code) && isValidConsecutive(code) && !usedCodes.has(codeStr)) {
      return code;
    }
    attempts++;
  }
  
  // Fallback if somehow we collide too much (virtually impossible with 10M combinations)
  return Array.from({ length }, (_, i) => ((i + Date.now()) % 10).toString());
};

export const shuffleArray = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};
