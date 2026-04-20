import { describe, it, expect, vi, beforeEach } from "vitest";
import knowledgeHandler from "../knowledge.handler";
import { authService } from "../../services/auth/auth.service";
import { KnowledgeService } from "../../services/knowledge.service";

// Mock DB
const mockDB = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn().mockResolvedValue({ id: "agent-1", role: "admin", mfa_enabled: true }),
};

const JWT_SECRET = "test-secret-key-at-least-32-chars-long-123456";
let validToken: string;

describe("Knowledge Handler Integration Tests", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const mockUser = {
      id: "agent-1",
      email: "agent@example.com",
      role: "admin" as const,
      mfa_enabled: true,
    };
    // authMiddleware expects session in db or a valid JWT
    validToken = await authService.generateToken(mockUser as any, JWT_SECRET, true);
  });

  const request = async (path: string, method: string = "GET", body?: any) => {
    return knowledgeHandler.request(
      path,
      {
        method,
        headers: {
          Authorization: `Bearer ${validToken}`,
          "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
      },
      { DB: mockDB as any, JWT_SECRET }
    );
  };

  describe("Categories", () => {
    it("should get categories", async () => {
      vi.spyOn(KnowledgeService.prototype, 'getCategories').mockResolvedValue([{ id: "cat-1", name: "General", created_at: "", updated_at: "" }] as any);
      const res = await request("/categories");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([{ id: "cat-1", name: "General", created_at: "", updated_at: "" }]);
    });

    it("should create a category with valid payload", async () => {
      const mockCreate = vi.spyOn(KnowledgeService.prototype, 'createCategory').mockResolvedValue("new-cat-id");
      const res = await request("/categories", "POST", { name: "New Category" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ id: "new-cat-id" });
      expect(mockCreate).toHaveBeenCalledWith("New Category", undefined);
    });

    it("should reject creating a category with missing name", async () => {
      const res = await request("/categories", "POST", { name: "" });
      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toBe("Name is required");
    });

    it("should delete a category", async () => {
      const mockDelete = vi.spyOn(KnowledgeService.prototype, 'deleteCategory').mockResolvedValue(undefined);
      const res = await request("/categories/cat-1", "DELETE");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ success: true });
      expect(mockDelete).toHaveBeenCalledWith("cat-1");
    });
  });

  describe("Articles", () => {
    it("should create an article with valid payload", async () => {
      const mockCreate = vi.spyOn(KnowledgeService.prototype, 'createArticle').mockResolvedValue("new-article-id");
      const res = await request("/articles", "POST", { title: "Title", content: "Content" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ id: "new-article-id" });
      expect(mockCreate).toHaveBeenCalledWith("Title", "Content", null);
    });

    it("should reject creating an article with missing content", async () => {
      const res = await request("/articles", "POST", { title: "Title" });
      expect(res.status).toBe(400);
    });

    it("should update an article with valid payload", async () => {
      const mockUpdate = vi.spyOn(KnowledgeService.prototype, 'updateArticle').mockResolvedValue(undefined);
      const res = await request("/articles/art-1", "PUT", { title: "New Title", content: "New Content" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ success: true });
      expect(mockUpdate).toHaveBeenCalledWith("art-1", "New Title", "New Content", null);
    });

    it("should get article content", async () => {
      const mockGetContent = vi.spyOn(KnowledgeService.prototype, 'getArticleContent').mockResolvedValue("Article content here");
      const res = await request("/articles/art-1/content");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ content: "Article content here" });
      expect(mockGetContent).toHaveBeenCalledWith("art-1");
    });

    it("should handle article content not found", async () => {
      const mockGetContent = vi.spyOn(KnowledgeService.prototype, 'getArticleContent').mockRejectedValue(new Error("Article not found"));
      const res = await request("/articles/art-1/content");
      expect(res.status).toBe(404);
      const data: any = await res.json();
      expect(data.error).toBe("Article not found");
    });
  });
});