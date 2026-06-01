export interface DiffToken {
  text: string;
  type: 'same' | 'added' | 'removed';
}

function tokenize(text: string): string[] {
  // Split on word boundaries, preserving whitespace and punctuation as tokens
  return text.split(/(\s+|[.,;:!?()[\]{}"'`])/);
}

export function computeDiff(original: string, updated: string): DiffToken[] {
  const origTokens = tokenize(original);
  const updTokens = tokenize(updated);

  // LCS-based diff (Myers simplified via DP)
  const n = origTokens.length;
  const m = updTokens.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = origTokens[i - 1] === updTokens[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const result: DiffToken[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origTokens[i - 1] === updTokens[j - 1]) {
      result.push({ text: origTokens[i - 1], type: 'same' });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ text: updTokens[j - 1], type: 'added' });
      j--;
    } else {
      result.push({ text: origTokens[i - 1], type: 'removed' });
      i--;
    }
  }

  return result.reverse();
}
