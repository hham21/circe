import type { Runnable } from "../types.js";
import { getFormatter } from "../context.js";

interface ContractOptions {
  maxRounds?: number;
}

export class Contract implements Runnable {
  private proposer: Runnable;
  private reviewer: Runnable;
  private maxRounds: number;

  constructor(proposer: Runnable, reviewer: Runnable, options?: ContractOptions) {
    this.proposer = proposer;
    this.reviewer = reviewer;
    this.maxRounds = options?.maxRounds ?? 3;
  }

  async run(input: unknown): Promise<unknown> {
    const formatter = getFormatter() as any;
    let currentInput = input;
    let review: unknown = null;

    for (let i = 0; i < this.maxRounds; i++) {
      if (formatter?.logInfo) {
        formatter.logInfo(`Contract round ${i + 1}/${this.maxRounds}`);
      }

      const proposal = await this.proposer.run(currentInput);
      const rawReview = await this.reviewer.run(proposal);
      review = this.parseReview(rawReview);

      if (formatter?.logRoundResult) {
        formatter.logRoundResult(review);
      }

      if (this.isAccepted(review)) {
        return review;
      }

      currentInput = review;
    }

    return review;
  }

  private parseReview(review: unknown): unknown {
    if (typeof review !== "string") return review;
    return this.extractJson(review) ?? review;
  }

  private extractJson(text: string): Record<string, unknown> | null {
    const codeBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      try { return JSON.parse(codeBlockMatch[1]); } catch { /* fall through */ }
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
    }

    return null;
  }

  private isAccepted(review: unknown): boolean {
    if (review != null && typeof review === "object") {
      const accepted = (review as any).accepted;
      if (typeof accepted === "boolean") return accepted;
    }

    return false;
  }
}
