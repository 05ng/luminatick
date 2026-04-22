import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiService } from '../ai.service';
import { Env } from '../../bindings';

describe('AiService', () => {
  let aiService: AiService;
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      AI: {
        run: vi.fn(),
      },
    } as any;
    aiService = new AiService(mockEnv);
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings for given text', async () => {
      const mockResult = {
        data: [[0.1, 0.2, 0.3]],
      };
      (mockEnv.AI.run as any).mockResolvedValue(mockResult);

      const result = await aiService.generateEmbeddings('test text');

      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-large-en-v1.5', {
        text: ['test text'],
      });
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should handle flat array returned by some AI models', async () => {
      const mockResult = {
        data: [0.4, 0.5, 0.6],
      };
      (mockEnv.AI.run as any).mockResolvedValue(mockResult);

      const result = await aiService.generateEmbeddings('test text');

      expect(result).toEqual([0.4, 0.5, 0.6]);
    });

    it('should throw error if no data is returned', async () => {
      (mockEnv.AI.run as any).mockResolvedValue({ data: [] });

      await expect(aiService.generateEmbeddings('test text')).rejects.toThrow('Failed to generate embeddings');
    });

    it('should handle AI model errors', async () => {
      (mockEnv.AI.run as any).mockRejectedValue(new Error('AI Error'));

      await expect(aiService.generateEmbeddings('test text')).rejects.toThrow('Failed to generate embeddings');
    });
  });

  describe('generateSuggestion', () => {
    it('should generate a suggestion based on input and context', async () => {
      const mockResult = {
        response: 'Suggested response',
      };
      (mockEnv.AI.run as any).mockResolvedValue(mockResult);

      const result = await aiService.generateSuggestion({
        input: 'How do I reset my password?',
        context: ['Go to settings and click reset.'],
      });

      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/meta/llama-3-8b-instruct', expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user', content: expect.stringContaining('How do I reset my password?') }),
        ]),
      }));
      expect(result).toBe('Suggested response');
    });

    it('should include systemInstruction in the system prompt if provided', async () => {
      const mockResult = {
        response: 'SOP Suggested response',
      };
      (mockEnv.AI.run as any).mockResolvedValue(mockResult);

      const result = await aiService.generateSuggestion({
        input: 'I lost my access code.',
        context: ['SOP: ask for email.'],
        systemInstruction: 'IMPORTANT: Do not expose SOP.',
      });

      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/meta/llama-3-8b-instruct', expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ 
            role: 'system',
            content: expect.stringContaining('IMPORTANT: Do not expose SOP.')
          }),
        ]),
      }));
      expect(result).toBe('SOP Suggested response');
    });

    it('should return a friendly error message on failure', async () => {
      (mockEnv.AI.run as any).mockRejectedValue(new Error('AI Error'));

      const result = await aiService.generateSuggestion({
        input: 'input',
        context: [],
      });

      expect(result).toContain('I\'m sorry, I\'m having trouble generating a suggestion');
    });
  });

  describe('generateResponse', () => {
    it('should correctly prepend the system prompt and history', async () => {
      const mockResult = {
        response: 'AI response',
      };
      (mockEnv.AI.run as any).mockResolvedValue(mockResult);

      const history = [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' },
      ];

      const result = await aiService.generateResponse('Current question', 'Provided context', history);

      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/meta/llama-3-8b-instruct', {
        messages: [
          expect.objectContaining({ role: 'system', content: expect.stringContaining('You are a helpful customer support AI') }),
          { role: 'user', content: 'Previous question' },
          { role: 'assistant', content: 'Previous answer' },
          expect.objectContaining({ role: 'user', content: expect.stringContaining('Current question') }),
        ],
        max_tokens: 512,
      });

      expect(result).toBe('AI response');
    });

    it('should return a friendly error message on failure', async () => {
      (mockEnv.AI.run as any).mockRejectedValue(new Error('AI Error'));

      const result = await aiService.generateResponse('question', 'context');

      expect(result).toContain("I'm having trouble connecting to my brain. Please try again later.");
    });
  });
});
