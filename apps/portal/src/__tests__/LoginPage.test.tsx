import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginPage } from '../pages/LoginPage';
import { MemoryRouter } from 'react-router-dom';
import { portalApi } from '../api/client';

// Mock the API client
vi.mock('../api/client', () => ({
  portalApi: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(portalApi.get).mockResolvedValue({});
  });

  it('renders login form correctly', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Sign in to Support')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByText('Send Magic Link')).toBeInTheDocument();
  });

  it('handles email input and submission via magic link', async () => {
    vi.mocked(portalApi.post).mockResolvedValueOnce({});

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = await screen.findByLabelText('Email address');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    
    const submitButton = screen.getByRole('button', { name: /Send Magic Link/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(portalApi.post).toHaveBeenCalledWith('/auth/request', {
        email: 'test@example.com',
        type: 'magic_link',
        turnstileToken: null,
        baseUrl: 'http://localhost:3000', // JSDOM default origin
      });
    });

    expect(screen.getByText('Check your email')).toBeInTheDocument();
  });
});
