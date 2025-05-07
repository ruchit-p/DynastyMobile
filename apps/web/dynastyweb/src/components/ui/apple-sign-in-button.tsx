import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';

interface AppleSignInButtonProps {
  onClick: () => Promise<void>;
  loading: boolean;
  className?: string;
  label?: string;
}

export function AppleSignInButton({
  onClick,
  loading,
  className = '',
  label = 'Sign in with Apple',
}: AppleSignInButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className={`w-full flex items-center justify-center space-x-2 ${className}`}
      onClick={onClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
      ) : (
        <Image
          src="/apple-logo.svg"
          alt="Apple Logo"
          width={20}
          height={20}
          className="mr-2"
        />
      )}
      <span>{loading ? 'Signing in...' : label}</span>
    </Button>
  );
} 