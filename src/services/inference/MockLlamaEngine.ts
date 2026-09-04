import { ChatMessage, GenerationStats } from '../../types/chat';
import { ModelMetadata, InferenceSettings } from '../../types/model';

/**
 * High performance mock / simulator engine for development, UI preview,
 * and environments without direct mobile GPU runtime.
 */
export class MockLlamaEngine {
  private activeModel: ModelMetadata | null = null;
  private isGenerating = false;
  private shouldStop = false;

  async loadModel(model: ModelMetadata, settings?: Partial<InferenceSettings>): Promise<boolean> {
    // Simulate loading delay based on model size
    await new Promise((resolve) => setTimeout(resolve, 600));
    this.activeModel = model;
    return true;
  }

  async unloadModel(): Promise<void> {
    this.activeModel = null;
  }

  isLoaded(): boolean {
    return this.activeModel !== null;
  }

  getActiveModel(): ModelMetadata | null {
    return this.activeModel;
  }

  stopGeneration(): void {
    this.shouldStop = true;
  }

  async generateStream(
    prompt: string,
    history: ChatMessage[],
    settings: InferenceSettings,
    onToken: (token: string) => void,
    onComplete: (fullText: string, stats: GenerationStats) => void
  ): Promise<void> {
    if (this.isGenerating) {
      throw new Error('Inference is already in progress');
    }

    this.isGenerating = true;
    this.shouldStop = false;

    const startTime = Date.now();
    const lastUserMessage = history[history.length - 1]?.content || prompt;

    // Generate intelligent contextual response
    const generatedResponse = this.craftContextualResponse(lastUserMessage, this.activeModel?.name);
    const words = generatedResponse.split(' ');

    let accumulatedText = '';
    let tokenCount = 0;

    for (let i = 0; i < words.length; i++) {
      if (this.shouldStop) {
        break;
      }

      const token = (i > 0 ? ' ' : '') + words[i];
      accumulatedText += token;
      tokenCount += 1;
      onToken(token);

      // Simulate realistic on-device mobile token speed (~25-45 ms/token -> 25-40 tokens/sec)
      await new Promise((resolve) => setTimeout(resolve, 32));
    }

    const elapsedMs = Math.max(Date.now() - startTime, 1);
    const tokensPerSec = Number(((tokenCount / elapsedMs) * 1000).toFixed(1));

    const stats: GenerationStats = {
      tokensEvaluated: Math.round(prompt.length / 4),
      tokensGenerated: tokenCount,
      evalDurationMs: Math.min(elapsedMs, 40),
      generateDurationMs: elapsedMs,
      tokensPerSecond: tokensPerSec,
    };

    this.isGenerating = false;
    onComplete(accumulatedText, stats);
  }

  private craftContextualResponse(userInput: string, modelName = 'Ultron SLM'): string {
    const inputTrimmed = userInput.trim();
    const inputLower = inputTrimmed.toLowerCase();

    // Check for coding or programming inquiries
    if (/\b(code|function|javascript|typescript|python|react|html|css|sql|script|algorithm|bug|fix|implement)\b/i.test(inputLower)) {
      const topic = inputTrimmed.replace(/^(write|code|create|show|give me|implement)\s+(a\s+|an\s+)?/i, '').replace(/[?.]+$/, '');
      return `Here is a clean implementation for **${topic || 'your request'}** using ${modelName} on Ultron Mobile:\n\n\`\`\`typescript\n// Solution for: ${topic || 'task'}\nexport function executeTask(input: string): { success: boolean; data: string } {\n  const normalized = input.trim();\n  if (!normalized) {\n    return { success: false, data: 'No valid input provided' };\n  }\n  return {\n    success: true,\n    data: \`Processed successfully: \${normalized}\`\n  };\n}\n\`\`\`\n\n### Key Points:\n- **Type safety**: Fully typed TypeScript contracts.\n- **Error handling**: Guards against invalid or empty states.\n- **Performance**: High throughput with minimal overhead.\n\n*Executed via ${modelName} with Ultron Mobile.*`;
    }

    // Check for conceptual or analytical questions
    if (/^(what|why|how|explain|describe|tell me about|compare|difference|who)\b/i.test(inputLower)) {
      const cleanSubject = inputTrimmed.replace(/^(what is|what are|why is|how does|explain|tell me about|who is)\s+(the\s+|a\s+|an\s+)?/i, '').replace(/[?.]+$/, '');
      const subjectTitle = cleanSubject ? cleanSubject.charAt(0).toUpperCase() + cleanSubject.slice(1) : 'Analysis';
      return `### Overview: ${subjectTitle}\n\nHere is a structured analysis based on your inquiry:\n\n1. **Core Concept**: Understanding the key principles and structure behind **${subjectTitle}**.\n2. **Practical Application**: In production and real-world workflows, this approach ensures high stability and deterministic performance.\n3. **Best Practices**: Maintain clear modular design, minimize side effects, and verify output against expectations.\n\n> [!NOTE]\n> Processed locally via **${modelName}** on Ultron Mobile with zero cloud telemetry.\n\n*Let me know if you would like me to provide further technical details, architecture diagrams, or step-by-step guidance!*`;
    }

    // Dynamic contextual response for general queries
    return `I have processed your request: "${inputTrimmed.slice(0, 90)}"\n\n- **Model**: ${modelName}\n- **Engine**: Ultron Mobile Local Core\n- **Execution**: On-device processing complete without cloud transmission.\n\nHow would you like to build on this next?`;
  }
}
