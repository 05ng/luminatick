# Knowledge Base Setup Guide

Luminatick features an AI-first, two-tier Knowledge Base designed for both your customers and your support agents. Because it is natively integrated with Cloudflare Vectorize and Workers AI, every article you create is automatically indexed for semantic search and Retrieval-Augmented Generation (RAG).

This guide explains how to set up your knowledge base and the key differences between the two article tiers.

---

## The Two-Tier Architecture

To ensure strict separation between public advice and internal procedures, Luminatick categorizes knowledge into two distinct tiers: **Answers** and **SOPs**.

### 1. Answers (Customer-Facing)
Answers are public-facing articles designed to help customers resolve issues independently.
- **Audience:** Customers, External Users.
- **Use Cases:** FAQs, setup guides, troubleshooting steps, policy explanations.
- **AI Integration:** When a customer asks a question via the Web Widget, or when the AI auto-drafts a ticket response, the AI *only* pulls information from the "Answers" tier. This prevents internal data from leaking to the public.

### 2. SOPs (Internal Agent Reference)
SOPs (Standard Operating Procedures) are strictly for internal use by your agents and admins.
- **Audience:** Authenticated Agents and Administrators only.
- **Use Cases:** Escalation policies, refund approval steps, internal system access guides, handling abusive customers.
- **AI Integration:** When an agent searches for information or uses AI assistance internally, the system queries *both* Answers and SOPs. The AI cannot see or use SOPs when communicating with customers.

---

## Creating Knowledge Base Articles

To create a robust knowledge base, you should populate it with both Answers and SOPs.

### Step-by-Step: Creating an Answer Article
Follow these steps to create a public-facing help article:

1. Log in to the **Luminatick Dashboard** as an Admin or Agent.
2. Navigate to **Knowledge Base** in the left sidebar.
3. Click **New Article** to open the Markdown editor.
4. **Title:** Enter a clear, customer-friendly title (e.g., "How to Reset Your Password").
5. **Category:** Select an appropriate category (e.g., "Account Management"). *Note: You can manage categories within the Knowledge Base section.*
6. **Tier:** Select **Answer**. This is crucial for keeping the content public and available for customer AI drafts.
7. **Content:** Write the article using the full-featured Markdown editor. Be concise and use step-by-step instructions.
8. Click **Save** or **Publish**.

*Behind the scenes: Once published, Cloudflare Workers AI automatically vectorizes the article text and stores the embeddings in Cloudflare Vectorize for immediate RAG availability.*

### Step-by-Step: Creating an SOP Article
Follow these steps to create an internal procedure guide:

1. Log in to the **Luminatick Dashboard**.
2. Navigate to **Knowledge Base**.
3. Click **New Article**.
4. **Title:** Enter a descriptive title for internal use (e.g., "SOP: Processing High-Value Refunds").
5. **Category:** Select a relevant category (e.g., "Billing Procedures").
6. **Tier:** Select **SOP**. This guarantees the content remains hidden from customers and public AI interactions.
7. **Content:** Write the internal procedure. Include strict guidelines, links to internal tools, and escalation paths.
8. Click **Save** or **Publish**.

---

## Best Practices for AI-First Knowledge

Because Luminatick uses semantic search (Cloudflare Vectorize) rather than exact keyword matching, keep these best practices in mind:

- **Write Naturally:** The AI understands context and meaning. Write sentences naturally rather than stuffing them with keywords.
- **Clear Headings:** Use Markdown headings (`##`, `###`) to structure your articles. This helps the system chunk the document effectively for AI ingestion.
- **Keep SOPs Separate:** Never mix internal instructions and public steps in the same article. Create two separate articles (one Answer, one SOP) if a topic requires both public explanation and internal processing steps.

---

## Summary

| Tier | Audience | AI Context Retrieval | Best For |
| :--- | :--- | :--- | :--- |
| **Answer** | Public / Customers | Used for Customer Auto-Drafts & Widget Chat | FAQs, public troubleshooting, general guides. |
| **SOP** | Internal Agents | Used ONLY for internal Agent search/assistance | Escalation flows, sensitive internal procedures. |
