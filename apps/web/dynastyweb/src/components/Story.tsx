"use client"

import { Heart, MessageSquare, MoreHorizontal, Bookmark, Lock, MapPin, FileText, Video, AudioLines, Image as ImageIcon } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useState, useEffect } from "react"
import { Button } from "./ui/button"
import { Card, CardHeader, CardContent, CardFooter } from "./ui/card"
import { Badge } from "./ui/badge"
import ProfilePicture from "./ui/ProfilePicture"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { toggleStoryLike, checkStoryLikeStatus, type Story as StoryType } from "@/utils/storyUtils"
import eventManager, { LikeEventData } from "@/utils/eventUtils"
import { formatDate, formatTimeAgo } from "@/utils/dateUtils"
import { ensureAccessibleStorageUrl } from "@/utils/mediaUtils"

interface MediaCount {
  text: number
  image: number
  video: number
  audio: number
}

interface StoryProps {
  story: StoryType & {
    author: {
      id: string;
      displayName: string;
      profilePicture?: string;
    };
    taggedPeople: Array<{
      id: string;
      displayName: string;
    }>;
  }
  currentUserId: string
}

export function StoryCard({ story, currentUserId }: StoryProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(story.likeCount || 0);
  const [isSaved, setIsSaved] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  useEffect(() => {
    // Check if the user has liked this story
    checkStoryLikeStatus(story.id)
      .then(liked => {
        setIsLiked(liked);
      })
      .catch(error => {
        console.error(`[StoryCard] Error checking like status for story ${story.id}:`, error);
      });
    
    // Subscribe to like events for this story
    const unsubscribeLike = eventManager.subscribe<LikeEventData>('story:liked', (data) => {
      if (data.storyId === story.id && data.liked !== undefined) {
        setIsLiked(data.liked);
      }
    });
    
    const unsubscribeUnlike = eventManager.subscribe<LikeEventData>('story:unliked', (data) => {
      if (data.storyId === story.id && data.liked !== undefined) {
        setIsLiked(data.liked);
      }
    });
    
    // Cleanup subscriptions when the component unmounts
    return () => {
      unsubscribeLike();
      unsubscribeUnlike();
    };
  }, [story.id]);
  
  // Count different media types
  const getMediaCounts = (): MediaCount => {
    const mediaCount: MediaCount = { text: 0, image: 0, video: 0, audio: 0 };
    story.blocks.forEach(block => {
      if (block.type === 'text') mediaCount.text++;
      if (block.type === 'image') mediaCount.image++;
      if (block.type === 'video') mediaCount.video++;
      if (block.type === 'audio') mediaCount.audio++;
    });
    return mediaCount;
  };
  
  const mediaCounts = getMediaCounts();
  
  const isAuthor = story.authorID === currentUserId;
  const formattedTimeAgo = formatTimeAgo(story.createdAt);

  // Get first image from content if available
  const getCoverImage = () => {
    // Find the first image block
    const imageBlocks = story.blocks.filter(block => block.type === 'image');
    
    if (imageBlocks.length > 0 && imageBlocks[0].data) {
      if (Array.isArray(imageBlocks[0].data)) {
        return ensureAccessibleStorageUrl(imageBlocks[0].data[0]);
      }
      return ensureAccessibleStorageUrl(imageBlocks[0].data as string);
    }
    
    // Return empty string if no cover image found
    return "";
  };

  const coverImage = getCoverImage();

  const handleLike = async () => {
    // Using the utility function from storyUtils
    await toggleStoryLike(story.id, isLiked, (liked, countChange) => {
      setIsLiked(liked);
      setLikeCount(prev => prev + countChange);
    });
  };

  const handleSave = () => {
    setIsSaved(!isSaved);
    // In a real app, you'd call an API to update the saved status
  };

  return (
    <Card className="overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="p-4 pb-0">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <ProfilePicture 
              src={story.author.profilePicture} 
              name={story.author.displayName} 
              size="md"
            />
            <div>
              <div className="font-medium text-gray-900">{story.author.displayName}</div>
              <div className="flex items-center text-xs text-gray-500">
                <span>{formattedTimeAgo}</span>
                {story.eventDate && (
                  <>
                    <span className="mx-1">•</span>
                    <span className="bg-[#0A5C36]/10 text-[#0A5C36] px-1.5 py-0.5 rounded-full text-xs">
                      {formatDate(story.eventDate)}
                    </span>
                  </>
                )}
                {story.privacy === "privateAccess" && (
                  <>
                    <span className="mx-1">•</span>
                    <Lock className="h-3 w-3 text-[#0A5C36]" />
                  </>
                )}
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleSave} className="cursor-pointer">
                <Bookmark className="h-4 w-4 mr-2" />
                {isSaved ? "Unsave story" : "Save story"}
              </DropdownMenuItem>
              {isAuthor && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/story/${story.id}/edit`} className="cursor-pointer">
                      <svg
                        className="h-4 w-4 mr-2"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit story
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600 cursor-pointer">
                    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    Delete story
                  </DropdownMenuItem>
                </>
              )}
              {!isAuthor && (
                <DropdownMenuItem className="cursor-pointer">
                  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                  Report story
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <Link href={`/story/${story.id}`} className="block no-underline hover:no-underline">
          <h3 className="text-xl font-semibold text-gray-900 mb-2 hover:text-[#0A5C36] transition-colors">
            {story.title}
          </h3>

          {story.subtitle && <p className="text-gray-600 mb-3">{story.subtitle}</p>}

          {coverImage && !imageError && (
            <div className="relative aspect-[1/1] w-1/3 overflow-hidden rounded-lg mb-4">
              <Image 
                src={coverImage} 
                alt={story.title} 
                fill 
                className="object-cover"
                onError={() => setImageError(true)}
                sizes="(max-width: 768px) 33vw, 33vw"
                loading="lazy"
                quality={80}
                unoptimized={true}
              />
            </div>
          )}

          {story.location && (
            <div className="flex items-center gap-1 text-sm text-gray-600 mb-3">
              <MapPin className="h-4 w-4 text-[#0A5C36]" />
              <span>{story.location.address}</span>
            </div>
          )}

          {story.taggedPeople && story.taggedPeople.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-500">With:</span>
              <div className="flex items-center -space-x-2">
                {story.taggedPeople.slice(0, 3).map((person) => (
                  <ProfilePicture
                    key={person.id}
                    name={person.displayName}
                    size="xs"
                    className="border-2 border-white"
                  />
                ))}
                {story.taggedPeople.length > 3 && (
                  <div className="h-6 w-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center">
                    <span className="text-xs text-gray-600">+{story.taggedPeople.length - 3}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-2">
            {mediaCounts.text > 0 && (
              <Badge variant="outline" className="flex items-center gap-1 bg-[#0A5C36]/5">
                <FileText className="h-3 w-3 text-[#0A5C36]" />
                <span>{mediaCounts.text}</span>
              </Badge>
            )}
            {mediaCounts.image > 0 && (
              <Badge variant="outline" className="flex items-center gap-1 bg-[#0A5C36]/5">
                <ImageIcon className="h-3 w-3 text-[#0A5C36]" />
                <span>{mediaCounts.image}</span>
              </Badge>
            )}
            {mediaCounts.video > 0 && (
              <Badge variant="outline" className="flex items-center gap-1 bg-[#0A5C36]/5">
                <Video className="h-3 w-3 text-[#0A5C36]" />
                <span>{mediaCounts.video}</span>
              </Badge>
            )}
            {mediaCounts.audio > 0 && (
              <Badge variant="outline" className="flex items-center gap-1 bg-[#0A5C36]/5">
                <AudioLines className="h-3 w-3 text-[#0A5C36]" />
                <span>{mediaCounts.audio}</span>
              </Badge>
            )}
          </div>
        </Link>
      </CardContent>

      <CardFooter className="p-2 border-t bg-gray-50">
        <div className="flex items-center justify-start w-full gap-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn("gap-1 text-xs font-normal", isLiked ? "text-[#EF4444]" : "text-gray-600")}
            onClick={handleLike}
          >
            <Heart className="h-4 w-4" fill={isLiked ? "currentColor" : "none"} />
            <span>
              {likeCount > 0 ? likeCount : ""} Like{likeCount !== 1 ? "s" : ""}
            </span>
          </Button>

          <Link href={`/story/${story.id}#comments`} passHref>
            <Button variant="ghost" size="sm" className="gap-1 text-xs font-normal text-gray-600">
              <MessageSquare className="h-4 w-4" />
              <span>
                {story.commentCount ? `${story.commentCount} ` : ""}Comments
              </span>
            </Button>
          </Link>
        </div>
      </CardFooter>
    </Card>
  )
} 