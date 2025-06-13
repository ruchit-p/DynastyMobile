import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { cn } from "@/lib/utils";

interface ProfilePictureProps {
  src?: string;
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

/**
 * ProfilePicture Component
 * 
 * A reusable component that displays a user's profile picture if available,
 * or their initials as a fallback.
 * 
 * @param src - URL of the profile picture
 * @param name - User's name (used to generate initials)
 * @param size - Size of the avatar (defaults to "md")
 * @param className - Additional CSS classes
 */
export function ProfilePicture({ src, name, size = "md", className }: ProfilePictureProps) {
  // Generate initials from the name
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  // Size mapping
  const sizeClasses = {
    xs: "h-6 w-6 text-xs",
    sm: "h-8 w-8 text-sm",
    md: "h-10 w-10 text-base",
    lg: "h-12 w-12 text-lg",
    xl: "h-16 w-16 text-xl",
  };

  return (
    <Avatar className={cn(sizeClasses[size], "border-2 border-[#0A5C36]/10", className)}>
      {src ? (
        <AvatarImage
          src={src}
          alt={`${name}'s profile picture`}
          className="object-cover"
        />
      ) : (
        <AvatarFallback className="bg-[#0A5C36]/10 text-[#0A5C36]">
          {initials}
        </AvatarFallback>
      )}
    </Avatar>
  );
}

export default ProfilePicture; 