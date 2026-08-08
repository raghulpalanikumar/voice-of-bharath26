'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Shield, CreditCard, Percent, FileText, PhoneCall, Headphones } from 'lucide-react';

interface WelcomeViewProps {
  startButtonText: string;
  onStartCall: () => void;
  callEnded?: boolean;
  onStartAgain?: () => void;
}

export const WelcomeView = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & WelcomeViewProps>(
  ({ startButtonText, onStartCall, callEnded = false, onStartAgain, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className="mx-auto flex w-full max-w-4xl flex-col items-center justify-center px-4 py-8 md:px-8"
        {...props}
      >
        {/* Header Section */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="bg-primary/10 text-primary mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 shadow-xs">
            <Headphones className="h-8 w-8 animate-pulse" />
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {callEnded ? 'Call Completed' : 'Bharat Digital Bank'}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm md:text-base">
            {callEnded
              ? 'Thank you for speaking with us. Your conversation with our virtual assistant has ended.'
              : 'Speak directly with Samar, our AI-powered banking assistant, for instant guidance on loans, interest rates, and card blocking.'}
          </p>
        </div>

        {/* Action Button Section */}
        <div className="mb-12 flex flex-col items-center gap-4">
          {callEnded ? (
            <Button
              size="lg"
              onClick={onStartAgain ?? onStartCall}
              className="bg-primary hover:bg-primary/95 text-primary-foreground min-w-64 rounded-full px-8 py-6 text-sm font-semibold tracking-wide shadow-md transition-all hover:scale-105 active:scale-95"
            >
              Start Call Again
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={onStartCall}
              className="bg-primary hover:bg-primary/95 text-primary-foreground min-w-64 rounded-full px-8 py-6 text-sm font-semibold tracking-wide shadow-md transition-all hover:scale-105 active:scale-95"
            >
              {startButtonText}
            </Button>
          )}

          {/* Security Banner */}
          <div className="border-border bg-card/50 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs text-muted-foreground shadow-2xs backdrop-blur-xs">
            <Shield className="text-primary h-4 w-4 shrink-0" />
            <span>Secure Line: Samar will never ask for your PIN, OTP, password or CVV.</span>
          </div>
        </div>

        {/* Banking Capability Cards (Quick Help) */}
        {!callEnded && (
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {/* Card 1: Home Loans */}
            <div className="border-border bg-card/45 hover:border-primary/30 group flex flex-col rounded-2xl border p-5 shadow-2xs transition-all duration-300 hover:shadow-xs">
              <div className="bg-primary/10 text-primary mb-3 flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110">
                <Percent className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground text-sm">Loan Interest Rates</h3>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Home Loan rates start at <strong>8.5% p.a.</strong>, and Savings Account interest at <strong>4.0% p.a.</strong>
              </p>
            </div>

            {/* Card 2: Document Checklist */}
            <div className="border-border bg-card/45 hover:border-primary/30 group flex flex-col rounded-2xl border p-5 shadow-2xs transition-all duration-300 hover:shadow-xs">
              <div className="bg-primary/10 text-primary mb-3 flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground text-sm">Loan Document Checklist</h3>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Keep your <strong>Aadhaar Card, PAN Card</strong>, last 3 months salary slips, and 6 months bank statement ready.
              </p>
            </div>

            {/* Card 3: Card Blocking */}
            <div className="border-border bg-card/45 hover:border-primary/30 group flex flex-col rounded-2xl border p-5 shadow-2xs transition-all duration-300 hover:shadow-xs sm:col-span-2 md:col-span-1">
              <div className="bg-primary/10 text-primary mb-3 flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110">
                <CreditCard className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground text-sm">Credit Card Blocking</h3>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Instantly report and block lost cards. Ask Samar for steps or call our helpline at <strong>1800-123-4567</strong>.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
);

WelcomeView.displayName = 'WelcomeView';
