import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Server Actions are server-only modules; mock them so the form can
// render in jsdom without pulling "next/headers" in.
vi.mock("@/app/login/actions", () => ({
  signInAction: vi.fn(),
  sendMagicLinkAction: vi.fn(),
}));

import { LoginForm } from "@/app/login/login-form";

describe("LoginForm", () => {
  it("renders the sign-in heading and primary email/password inputs", () => {
    render(<LoginForm />);
    expect(
      screen.getByRole("heading", { level: 1, name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("type", "password");
  });

  it("renders the magic-link secondary affordance", () => {
    render(<LoginForm />);
    expect(
      screen.getByRole("button", { name: /or email me a sign-in link/i }),
    ).toBeInTheDocument();
  });

  it("renders inline alert text when an error is passed", () => {
    render(<LoginForm error="Invalid login credentials" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Invalid login credentials");
  });

  it("renders a status confirmation when sent=true", () => {
    render(<LoginForm sent />);
    expect(screen.getByRole("status")).toHaveTextContent(/sign-in link sent/i);
  });
});
