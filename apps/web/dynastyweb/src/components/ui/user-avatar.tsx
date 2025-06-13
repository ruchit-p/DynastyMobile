import { Avatar, AvatarFallback, AvatarImage } from './avatar';

interface UserAvatarProps {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
};

export function UserAvatar({ 
  src, 
  alt = 'User', 
  fallback,
  size = 'md',
  className = ''
}: UserAvatarProps) {
  const initials = fallback || alt.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  
  return (
    <Avatar className={`${sizeClasses[size]} ${className}`}>
      {src && <AvatarImage src={src} alt={alt} />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}