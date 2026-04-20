import { Env } from '../bindings';

export interface SuggestionParams {
  input: string;
  context: string[];
}

export class AiService {
  constructor(private env: Env) {}

  async generateEmbeddings(text: string): Promise<number[]> {
    try {
      const result = await this.env.AI.run('@cf/baai/bge-large-en-v1.5', {
        text: [text],
      });
      if (!result.data || result.data.length === 0) {
        throw new Error('No embeddings returned from AI model');
      }
      // Depending on the Cloudflare AI runtime, data can be a flat array or an array of arrays
      const rawVector = Array.isArray(result.data[0]) ? result.data[0] : result.data;
      return Array.from(rawVector);
    } catch (error) {
      console.error('AI Embedding error:', error);
      throw new Error('Failed to generate embeddings');
    }
  }

  async generateSuggestion({ input, context }: SuggestionParams): Promise<string> {
    try {
      // Structured prompt to guide the model and mitigate injection
      const systemPrompt = `You are an expert customer support agent for Luminatick. 
Your goal is to provide helpful, professional, and concise responses based ONLY on the provided context.
If the context does not contain the answer, politely inform the user and ask for more details.
Do not make up information. Maintain a friendly and helpful tone.`;

      const userPrompt = `
Context Information:
---
${context.join('\n---\n')}
---

User Inquiry:
"${input}"

Please provide a suggested response:`;

      const result = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1024,
      });

      if (!result.response) {
        throw new Error('No response returned from AI model');
      }

      return result.response;
    } catch (error) {
      console.error('AI Suggestion error:', error);
      return "I'm sorry, I'm having trouble generating a suggestion right now. Please try again or draft a manual response.";
    }
  }

  async generateResponse(input: string, context: string, history: { role: string, content: string }[] = []): Promise<string> {
    try {
      const systemPrompt = `You are a helpful customer support AI for Luminatick.
Your goal is to answer the user's question accurately using ONLY the provided context.
If the answer is not in the context, say you don't know and suggest they contact support.
Keep your response professional and friendly.`;

      const userMessage = `Context:
---
${context}
---

User Inquiry:
${input}`;

      // Format messages: System prompt, then history, then the current user question + context
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ];

      const result = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: messages as any,
        max_tokens: 512,
      });

      return result.response || "I'm sorry, I couldn't generate a response.";
    } catch (error) {
      console.error('AI Response error:', error);
      return "I'm having trouble connecting to my brain. Please try again later.";
    }
  }
}
