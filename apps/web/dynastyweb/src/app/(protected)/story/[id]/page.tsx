"use client"
import { useState, useEffect, useRef, useCallback} from "react"
import { useParams, useRouter } from "next/navigation"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/context/AuthContext"
import { 
  CalendarIcon, 
  MapPin, 
  Lock, 
  Users, 
  Trash2, 
  Edit, 
  ArrowLeft, 
  Heart, 
  BookmarkIcon as Bookmark,  
  MessageSquare,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useToast } from "@/components/ui/use-toast"
import AudioPlayer from "@/components/AudioPlayer"
import VideoPlayer from "@/components/VideoPlayer"
import ProtectedRoute from "@/components/ProtectedRoute"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { 
  toggleStoryLike,
  checkStoryLikeStatus,
  getStoryLikes,
  getStoryComments,
  addComment,
  toggleCommentLike,
  getCommentLikes,
  type Comment,
  type CommentUser
} from "@/utils/storyUtils"
import { deleteStory } from "@/utils/functionUtils"
import DynastyCarousel from "@/components/DynastyCarousel"
import { MediaGallery, MediaItem } from "@/components/gallery"
import eventManager, { LikeEventData } from "@/utils/eventUtils"
import { formatDate, formatTimeAgo, getSmartDate } from "@/utils/dateUtils"
import { Spinner } from "@/components/ui/spinner"

// Updated getImageUrl that handles more edge cases
const getImageUrl = (url: string) => {
  // Handle empty or undefined URLs
  if (!url || url.trim() === '') {
    return "/placeholder.svg";
  }
  
  try {
    // Check if this is a Firebase Storage URL
    const isFirebaseStorageUrl = url.includes('firebasestorage.googleapis.com') || 
                               url.includes('dynasty-eba63.firebasestorage.app');
    
    // For Firebase Storage URLs, ensure they have the download token
    if (isFirebaseStorageUrl) {
      // If URL doesn't already have a query parameter
      if (!url.includes('?')) {
        return `${url}?alt=media`;
      }
      
      // If URL has query parameters but not alt=media
      if (!url.includes('alt=media')) {
        return `${url}&alt=media`;
      }
    }
    
    // Handle relative URLs (ensure they have a leading slash)
    if (!url.startsWith('http') && !url.startsWith('/')) {
      url = '/' + url;
    }
    
    // Handle Firebase Storage emulator URLs
    if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' && 
        url.includes('127.0.0.1:9199')) {
      const replaced = url.replace(
        'http://127.0.0.1:9199/v0/b/dynasty-eba63.firebasestorage.app', 
        'https://firebasestorage.googleapis.com'
      );
      
      // Add alt=media if not present
      if (!replaced.includes('?')) {
        return `${replaced}?alt=media`;
      } else if (!replaced.includes('alt=media')) {
        return `${replaced}&alt=media`;
      }
      
      return replaced;
    }
    
    // Handle special characters in URLs
    if (url.includes(' ') || url.includes('%20')) {
      url = url.replace(/ /g, '%20');
    }
    
    return url;
  } catch (error) {
    console.error("Error processing image URL:", error, url);
    return "/placeholder.svg";
  }
}

interface StoryData {
  title: string
  subtitle?: string
  authorID: string
  createdAt: { seconds: number; nanoseconds: number }
  eventDate?: { seconds: number; nanoseconds: number }
  location?: { lat: number; lng: number; address: string }
  privacy: "family" | "privateAccess" | "custom"
  peopleInvolved: string[]
  blocks: {
    type: "text" | "image" | "video" | "audio"
    data: string | string[]
    localId: string
  }[]
  likeCount?: number
  commentCount?: number
}

export default function StoryDetailsPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter();
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [story, setStory] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  
  const [authorName, setAuthorName] = useState("Anonymous");
  const [authorImage, setAuthorImage] = useState("/placeholder.svg");

  // Comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  
  // Likes modal
  const [showLikesModal, setShowLikesModal] = useState(false);
  const [likesUsers, setLikesUsers] = useState<CommentUser[]>([]);
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [activeLikeComment, setActiveLikeComment] = useState<string | null>(null);

  // Create a ref for comment elements to scroll to
  const commentRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

 
  useEffect(() => {
    // Subscribe to like events for this story
    if (id) {
      const unsubscribeLike = eventManager.subscribe<LikeEventData>('story:liked', (data) => {
        if (data.storyId === id) {
          console.log(`[StoryDetail] Received like event for story ${id}`);
          setIsLiked(true);
          setLikeCount(prev => prev + 1);
        }
      });
      
      const unsubscribeUnlike = eventManager.subscribe<LikeEventData>('story:unliked', (data) => {
        if (data.storyId === id) {
          console.log(`[StoryDetail] Received unlike event for story ${id}`);
          setIsLiked(false);
          setLikeCount(prev => Math.max(0, prev - 1));
        }
      });
      
      // Cleanup subscriptions when component unmounts
      return () => {
        unsubscribeLike();
        unsubscribeUnlike();
      };
    }
  }, [id]);

  useEffect(() => {
    // Check if URL has #comments hash
    if (window.location.hash === '#comments') {
      // Find the comments section element
      const commentsSection = document.getElementById('comments');
      if (commentsSection) {
        // Scroll to the comments section with smooth behavior
        commentsSection.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, []);

  // Fetch comments using the utility function
  const fetchComments = useCallback(async () => {
    if (!id) return;
    
  setLoadingComments(true);
  try {
    const fetchedComments = await getStoryComments(id);
    
    if (Array.isArray(fetchedComments)) {
      setComments(fetchedComments);
    } else {
      console.error("Invalid comments format fetched:", fetchedComments);
      setComments([]);
    }
  } catch (error) {
    console.error("Error fetching comments:", error);
    setComments([]);
    toast({
      title: "Error",
      description: "Unable to load comments, please try again later.",
      variant: "destructive",
    });
  } finally {
    setLoadingComments(false);
  }
  }, [id, toast]);

  // Ensure fetchComments is called correctly on component mount or updates
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const fetchStory = useCallback(async () => {
    if (!id) return;
    
    try {
      const storyRef = doc(db, "stories", id);
      const storySnap = await getDoc(storyRef);
      
      if (storySnap.exists()) {
        const storyData = storySnap.data() as StoryData;
        setStory(storyData);
        setLikeCount(storyData.likeCount || 0);
        
        // Get author info
        if (storyData.authorID) {
          const authorRef = doc(db, "users", storyData.authorID);
          const authorSnap = await getDoc(authorRef);
          
          if (authorSnap.exists()) {
            const authorData = authorSnap.data();
            setAuthorName(authorData.displayName || `${authorData.firstName} ${authorData.lastName}` || "Anonymous");
            if (authorData.profilePicture) {
              setAuthorImage(authorData.profilePicture);
            }
          }
        }
        
        // Check if the current user has liked this story
        if (currentUser) {
          const hasLiked = await checkStoryLikeStatus(id);
          setIsLiked(hasLiked);
          
          // Add back fetchComments call
          fetchComments();
        }
      } else {
        toast({
          title: "Story not found",
          description: "The story you're looking for might have been deleted or doesn't exist.",
          variant: "destructive",
        });
        router.push("/feed");
      }
    } catch (error) {
      console.error("Error fetching story:", error);
      toast({
        title: "Error",
        description: "There was an error loading this story.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast, currentUser, router, fetchComments]);

  useEffect(() => {
    fetchStory();
  }, [fetchStory]);

  // Delete story
  const handleDelete = async () => {
    if (!id || !currentUser) return;
    
    try {
      await deleteStory(id, currentUser.uid);
      toast({
        title: "Story deleted",
        description: "Your story has been successfully deleted.",
      });
      router.push("/feed");
    } catch (error) {
      console.error("Error deleting story:", error);
      toast({
        title: "Error",
        description: "Failed to delete the story. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Content extraction helpers
  const getStoryTextContent = () => {
    if (!story) return [];
    
    return story.blocks
      .filter(block => block.type === "text")
      .map(block => block.data as string);
  }

  const getMediaItems = (): MediaItem[] => {
    if (!story) return [];
    
    const mediaItems: MediaItem[] = [];
    
    story.blocks.forEach((block) => {
      if (block.type === 'image' || block.type === 'video' || block.type === 'audio') {
        if (Array.isArray(block.data)) {
          block.data.forEach((url, index) => {
            mediaItems.push({
              id: `${block.localId}-${index}`,
              url: getImageUrl(url),
              type: block.type,
              alt: `${story.title} - ${block.type} ${index + 1}`,
            });
          });
        } else if (typeof block.data === 'string') {
          mediaItems.push({
            id: block.localId,
            url: getImageUrl(block.data),
            type: block.type,
            alt: `${story.title} - ${block.type}`,
          });
        }
      }
    });
    
    return mediaItems;
  }

  // Get first audio URL if available
  const getFirstAudioUrl = () => {
    if (!story) return null;
    
    for (const block of story.blocks) {
      if (block.type === "audio") {
        if (Array.isArray(block.data) && block.data.length > 0) {
          return block.data[0];
        } else if (typeof block.data === "string") {
          return block.data;
        }
      }
    }
    return null;
  };

  // Handle liking a story using the utility function
  const handleLike = async () => {
    if (!currentUser) {
      toast({
        title: "Authentication Required",
        description: "Please log in to like stories",
        variant: "destructive",
      });
      return;
    }
    
    await toggleStoryLike(id, isLiked, (liked, countChange) => {
      setIsLiked(liked);
      setLikeCount(prev => prev + countChange);
    });
  };
  
  // Handle submitting a comment using the utility function
  const handleCommentSubmit = async () => {
    if (!commentText.trim() || !currentUser || !id) return;
    
    setSubmittingComment(true);
    try {
      const parentId = replyTo ? replyTo.id : undefined;
      console.log("Submitting comment with parentId:", parentId);
      
      const newComment = await addComment(id, commentText.trim(), parentId);
      console.log("New comment returned:", JSON.stringify(newComment, null, 2));
      
      if (newComment) {
        // Ensure the comment has a valid timestamp
        if (!newComment.createdAt || 
            (typeof newComment.createdAt === 'object' && 
             Object.keys(newComment.createdAt).length === 0)) {
          // Add a client-side timestamp if the server didn't provide one
          newComment.createdAt = {
            seconds: Math.floor(Date.now() / 1000),
            nanoseconds: 0
          };
          console.log("Added client-side timestamp to comment");
        }
        
        console.log("Comment timestamp after processing:", 
          typeof newComment.createdAt, 
          JSON.stringify(newComment.createdAt, null, 2));
        
        // Update the UI
        if (!parentId) {
          // If it's a new top-level comment
          setComments(prevComments => [newComment, ...prevComments]);
        } else {
          // If it's a reply, update the parent comment's replies
          setComments(prevComments => 
            prevComments.map(comment => {
              if (comment.id === parentId) {
                const updatedReplies = [...(comment.replies || []), newComment];
                return { ...comment, replies: updatedReplies };
              }
              return comment;
            })
          );
          setReplyTo(null);
        }
        
        // After successful comment submission, refresh all comments
        // to ensure we have the server-side data
        setTimeout(() => {
          fetchComments();
        }, 1000);
        
        setCommentText("");
        toast({
          title: "Success",
          description: "Your comment was posted",
        });
      }
    } catch (error) {
      console.error("Error submitting comment:", error);
    } finally {
      setSubmittingComment(false);
    }
  };
  
  // Handle liking a comment using the utility function
  const handleLikeComment = async (comment: Comment) => {
    if (!currentUser) {
      toast({
        title: "Authentication Required",
        description: "Please log in to like comments",
        variant: "destructive",
      });
      return;
    }
    
    // Update optimistically
    const updatedComments = updateCommentLikeStatus(comment, !comment.isLikedByMe);
    setComments(updatedComments);
    
    // Call the utility function - we don't need the callback since we've already updated optimistically
    const success = await toggleCommentLike(comment.id, comment.isLikedByMe);
    
    if (!success) {
      // Revert if the utility function indicates failure
      // It already shows the toast for us
      const revertedComments = updateCommentLikeStatus(comment, comment.isLikedByMe);
      setComments(revertedComments);
    }
  };
  
  // Helper to update a comment's like status in the state
  const updateCommentLikeStatus = (targetComment: Comment, newLikedStatus: boolean): Comment[] => {
    const updateComment = (comment: Comment): Comment => {
      if (comment.id === targetComment.id) {
        const updatedLikes = newLikedStatus 
          ? [...comment.likes, currentUser!.uid]
          : comment.likes.filter(id => id !== currentUser!.uid);
        
        return {
          ...comment,
          likes: updatedLikes,
          isLikedByMe: newLikedStatus
        };
      }
      
      // If the comment has replies, process them too
      if (comment.replies && comment.replies.length > 0) {
        return {
          ...comment,
          replies: comment.replies.map(reply => updateComment(reply))
        };
      }
      
      return comment;
    };
    
    return comments.map(comment => updateComment(comment));
  };
  
  // Fetch users who liked a story using the utility function
  const fetchStoryLikes = async () => {
    if (!id || !currentUser) return;
    
    setShowLikesModal(true);
    setLoadingLikes(true);
    setActiveLikeComment(null);
    
    try {
      const likes = await getStoryLikes(id);
      setLikesUsers(likes);
    } catch (error) {
      console.error("Error fetching likes:", error);
      // Toast is already handled in the utility function
    } finally {
      setLoadingLikes(false);
    }
  };
  
  // Fetch users who liked a comment using the utility function
  const fetchCommentLikes = async (commentId: string) => {
    if (!commentId || !currentUser) return;
    
    setShowLikesModal(true);
    setLoadingLikes(true);
    setActiveLikeComment(commentId);
    
    try {
      const likes = await getCommentLikes(commentId);
      setLikesUsers(likes);
    } catch (error) {
      console.error("Error fetching comment likes:", error);
      // Toast is already handled in the utility function
    } finally {
      setLoadingLikes(false);
    }
  };

  // Add a useEffect to adjust the padding of the page when the floating reply box is visible
  useEffect(() => {
    // Add bottom padding to the body when the floating reply box is visible
    if (replyTo) {
      document.body.style.paddingBottom = "120px"; // Adjust based on the height of your reply box
    } else {
      document.body.style.paddingBottom = "0";
    }

    // Cleanup function to reset the padding when the component unmounts
    return () => {
      document.body.style.paddingBottom = "0";
    };
  }, [replyTo]);

  // Function to set reply to a comment and scroll to highlight it
  const handleSetReplyTo = (comment: Comment) => {
    setCommentText("");
    setReplyTo(comment);
    
    // Find the comment element and scroll to it
    setTimeout(() => {
      const commentElement = commentRefs.current[comment.id];
      if (commentElement) {
        // Scroll the comment into view with a small offset
        const yOffset = -100; // Adjust this value as needed
        const y = commentElement.getBoundingClientRect().top + window.pageYOffset + yOffset;
        
        window.scrollTo({
          top: y,
          behavior: 'smooth'
        });
        
        // Add a highlight effect to the comment
        commentElement.classList.add('bg-yellow-50');
        
        // Remove the highlight after a short delay
        setTimeout(() => {
          commentElement.classList.remove('bg-yellow-50');
          commentElement.classList.add('bg-white');
          setTimeout(() => {
            commentElement.classList.remove('bg-white');
          }, 300);
        }, 1000);
      }
    }, 100);
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-[#F9FAFB]">
          <main className="container py-6">
            <div className="text-center py-8">
              <Spinner size="lg" variant="primary" className="mb-4" />
              <p className="text-[#0A5C36] font-medium">Loading story...</p>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    )
  }

  if (!story) {
    return (
      <ProtectedRoute>
        <div className="flex flex-col justify-center items-center min-h-screen bg-[#F9FAFB]">
          <p className="text-lg text-gray-600 mb-4">Story not found</p>
          <Button 
            variant="outline" 
            onClick={() => router.push('/feed')}
            className="border-[#0A5C36] text-[#0A5C36]"
          >
            Return to Feed
          </Button>
        </div>
      </ProtectedRoute>
    )
  }

  const audioUrl = getFirstAudioUrl();
  const formattedContent = getStoryTextContent().join("\n\n").split("\n\n").map((paragraph, index) => (
    <p key={index} className="mb-4 leading-relaxed">
      {paragraph}
    </p>
  ));
  const mediaItems = getMediaItems();
  const hasMedia = mediaItems.length > 0;
  
  return (
    <ProtectedRoute>
      <div className="max-w-4xl mx-auto bg-white">
        {/* Navigation */}
        <div className="sticky top-0 z-10 bg-white border-b py-3 px-4">
          <div className="flex flex-wrap items-center justify-between gap-y-2">
            <Link href="/feed" className="flex items-center text-[#0A5C36] hover:text-opacity-80 transition-colors">
              <ArrowLeft className="h-5 w-5 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline-block text-sm font-medium">Back to Stories</span>
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-full",
                  isLiked ? "text-red-500 hover:text-red-600" : "text-gray-500 hover:text-gray-600",
                )}
                onClick={handleLike}
              >
                <Heart className="h-4 w-4 mr-1" fill={isLiked ? "currentColor" : "none"} />
                <span className="text-xs">Like</span>
              </Button>
              
              {/* Like counts with dialog */}
              {likeCount > 0 && (
                <Dialog open={showLikesModal} onOpenChange={setShowLikesModal}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs text-gray-500 hover:text-gray-600 hover:bg-transparent p-0"
                      onClick={fetchStoryLikes}
                    >
                      {likeCount} {likeCount === 1 ? 'like' : 'likes'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        Liked by {activeLikeComment ? 'Comment' : 'Story'}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto">
                      {loadingLikes ? (
                        <div className="flex justify-center p-4">Loading...</div>
                      ) : likesUsers.length === 0 ? (
                        <div className="text-center py-4 text-gray-500">No likes yet</div>
                      ) : (
                        <div className="flex flex-col space-y-3">
                          {likesUsers.map((user) => (
                            <div key={user.id} className="flex items-center gap-2 py-2">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={user.profilePicture} alt={user.displayName} />
                                <AvatarFallback>{user.displayName.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{user.displayName}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-full",
                  isBookmarked ? "text-[#C4A55C] hover:text-opacity-80" : "text-gray-500 hover:text-gray-600",
                )}
                onClick={() => setIsBookmarked(!isBookmarked)}
              >
                <Bookmark className="h-4 w-4 mr-1" fill={isBookmarked ? "currentColor" : "none"} />
                <span className="text-xs">Save</span>
              </Button>
            
              
              {currentUser?.uid === story.authorID && (
                <>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="rounded-full text-gray-500 hover:text-gray-600"
                    onClick={() => router.push(`/story/${id}/edit`)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    <span className="text-xs">Edit</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="rounded-full text-red-500 hover:text-red-600"
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    <span className="text-xs">Delete</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Story Header */}
        <header className="px-4 pt-4 md:px-6 md:pt-6">
          <div className="flex flex-col ">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">{story.title}</h1>
        {story.subtitle && <p className="text-lg text-gray-600 mt-[-8px]">{story.subtitle}</p>} 
        </div>
          <div className="flex flex-col gap-2">
           

            <div className="flex items-center">
              <Avatar className="h-10 w-10 border-2 border-[#0A5C36]/10">
                <AvatarImage src={authorImage} alt={authorName} />
                <AvatarFallback className="bg-[#0A5C36]/10 text-[#0A5C36]">
                  {authorName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div className="ml-3">
                <div className="text-sm font-medium text-gray-900">{authorName}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-500">
              {story.eventDate && (
                <>
                  <span className="bg-[#0A5C36]/10 text-[#0A5C36] px-2 py-0.5 rounded-full text-xs font-medium">{formatDate(story.eventDate)}</span>
                  {((!story.eventDate || formatDate(story.eventDate) !== formatDate(story.createdAt)) || story.privacy) && (
                    <span>•</span>
                  )}
                </>
              )}
              {(!story.eventDate || formatDate(story.eventDate) !== formatDate(story.createdAt)) && (
                <div className="flex items-center gap-1">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <span>{story.createdAt ? <>{formatTimeAgo(story.createdAt)}<span>•</span></> : ""}</span>
                </div>
              )}
              {story.privacy && (
                <>
                  <div className="flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" />
                    <span>{story.privacy === "family" ? "Family" : story.privacy === "privateAccess" ? "Private" : "Custom"}</span>
                  </div>
                </>
              )}
            </div>

            
            {story.peopleInvolved && story.peopleInvolved.length > 0 && (
              <div className="mt-4 flex items-center text-sm text-gray-600">
                <Users className="mr-2 h-4 w-4 text-[#0A5C36]" />
                <span>{story.peopleInvolved.length} people tagged in this story</span>
              </div>
            )}
          </div>

           {/* Location */}
           {story.location && (
            <div className="my-3 p-3 bg-gray-50 rounded-lg flex items-center text-sm">
              <div className="bg-[#0A5C36]/10 p-2 rounded-md mr-3">
                <MapPin className="h-5 w-5 text-[#0A5C36]" />
              </div>
              <div>
                <div className="font-medium text-gray-900">Location</div>
                <div className="text-gray-600">{story.location.address}</div>
              </div>
            </div>
          )}
        </header>

        <div className="px-4 md:px-6">
         
        {/* First separator - remove horizontal margins since the parent already has padding */}
        <Separator className="my-4" />

        {/* Story Content */}
          {/* Audio Player (if available) */}
          {audioUrl && (
            <div className="mb-6 p-4 bg-[#0A5C36]/10 rounded-lg">
              <div className="flex items-center">
                <div className="w-full">
                  <div className="text-sm font-medium text-[#0A5C36] mb-2">Listen to this story</div>
                  <AudioPlayer url={audioUrl} />
                </div>
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="prose prose-green max-w-none mb-8">
            {formattedContent.map((paragraph, index) => (
              <div 
                key={index} 
                className="mb-6 p-5 border border-[#0A5C36]/10 rounded-lg bg-white shadow-sm"
              >
                <div className="relative">
                  {/* Subtle accent bar using the gold/amber color */}
                  <div className="absolute -left-5 top-0 h-full w-1 rounded-full"></div>
                  {paragraph}
                </div>
              </div>
            ))}
          </div>

          {/* Media Gallery */}
          {hasMedia && (
            <div className="mt-8">
              <MediaGallery
                items={mediaItems}
                mode="detail"
                enableLightbox={true}
                showIndicators={true}
                showArrows={true}
                showThumbs={mediaItems.length > 3}
                maxHeight={600}
                aspectRatio="auto"
                className="rounded-lg overflow-hidden border"
              />
            </div>
          )}
        </div>

        {/* Comments Section */}
        <div className="px-4 md:px-6 py-8 bg-gray-50" id="comments">
          <h2 className="text-xl font-semibold mb-6 flex items-center">
            <MessageSquare className="h-5 w-5 mr-2 text-[#0A5C36]" />
            Comments {comments.length > 0 && `(${comments.length})`}
          </h2>
          
          {/* Comment Form */}
          <div className="mb-6">
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={currentUser?.photoURL || undefined}
                  alt={currentUser?.displayName || "User"}
                />
                <AvatarFallback>{currentUser?.displayName?.[0] || "U"}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="resize-none bg-white"
                  disabled={!currentUser || submittingComment}
                />
                <Button
                  className="mt-2 bg-[#0A5C36] hover:bg-[#084026]"
                  size="sm"
                  disabled={!commentText.trim() || !currentUser || submittingComment}
                  onClick={handleCommentSubmit}
                >
                  {submittingComment ? (
                    <>
                      <Spinner size="sm" variant="white" className="mr-2" />
                      Posting...
                    </>
                  ) : "Post Comment"}
                </Button>
              </div>
            </div>
          </div>
          
          {/* Comment List */}
          {loadingComments ? (
            <div className="text-center py-8">
              <Spinner size="md" variant="primary" className="mb-3" />
              <p className="text-[#0A5C36]">Loading comments...</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-2">No comments yet on this story.</p>
              <p className="text-[#0A5C36] text-sm">Be the first to share your thoughts or ask a question!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {comments.map((comment) => (
                <div 
                  key={comment.id} 
                  className="bg-white p-4 rounded-lg shadow-sm mb-6 transition-colors duration-300"
                  ref={(el) => {
                    commentRefs.current[comment.id] = el;
                  }}
                >
                  {/* Comment Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={comment.user.profilePicture}
                        alt={comment.user.displayName}
                      />
                      <AvatarFallback>{comment.user.displayName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{comment.user.displayName}</h4>
                          <p className="text-xs text-gray-500">
                            {getSmartDate(comment.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Comment Body */}
                  <div className="pl-11">
                    <p className="text-gray-800 mb-3">{comment.text}</p>
                    
                    {/* Comment Actions */}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className={cn(
                          "h-6 px-2",
                          comment.isLikedByMe ? "text-red-500" : "text-gray-500"
                        )}
                        onClick={() => handleLikeComment(comment)}
                      >
                        <Heart 
                          className="h-3 w-3 mr-1" 
                          fill={comment.isLikedByMe ? "currentColor" : "none"} 
                        />
                        Like
                      </Button>
                      
                      {/* Like count */}
                      {comment.likes.length > 0 && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 p-0 text-xs text-gray-500 hover:bg-transparent"
                          onClick={() => fetchCommentLikes(comment.id)}
                        >
                          {comment.likes.length} {comment.likes.length === 1 ? 'like' : 'likes'}
                        </Button>
                      )}
                      
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2"
                        onClick={() => handleSetReplyTo(comment)}
                      >
                        Reply
                      </Button>
                    </div>
                    
                    {/* Replies */}
                    {comment.replies && comment.replies.length > 0 && (
                      <div className="mt-4 space-y-4">
                        {comment.replies.map((reply) => (
                          <div 
                            key={reply.id} 
                            className={cn(
                              "pl-3 border-l-2",
                              // Use different border colors based on nesting level
                              reply.depth === 1 ? "border-[#0A5C36]/20" : 
                              reply.depth === 2 ? "border-[#C4A55C]/30" : 
                              "border-gray-100"
                            )}
                          >
                            {/* Reply Header */}
                            <div className="flex items-start gap-2 mb-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage
                                  src={reply.user.profilePicture}
                                  alt={reply.user.displayName}
                                />
                                <AvatarFallback>{reply.user.displayName[0]}</AvatarFallback>
                              </Avatar>
                              <div>
                                <h5 className="font-medium text-sm">{reply.user.displayName}</h5>
                                <p className="text-xs text-gray-500">
                                  {formatDate(reply.createdAt)}
                                </p>
                              </div>
                            </div>
                            
                            {/* Reply Body */}
                            <div className="pl-8">
                              <p className="text-gray-800 text-sm mb-2">{reply.text}</p>
                              
                              {/* Reply Actions */}
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className={cn(
                                    "h-5 px-1.5",
                                    reply.isLikedByMe ? "text-red-500" : "text-gray-500"
                                  )}
                                  onClick={() => handleLikeComment(reply)}
                                >
                                  <Heart 
                                    className="h-3 w-3 mr-1" 
                                    fill={reply.isLikedByMe ? "currentColor" : "none"} 
                                  />
                                  Like
                                </Button>
                                
                                {/* Reply like count */}
                                {reply.likes.length > 0 && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-5 p-0 text-xs text-gray-500 hover:bg-transparent"
                                    onClick={() => fetchCommentLikes(reply.id)}
                                  >
                                    {reply.likes.length} {reply.likes.length === 1 ? 'like' : 'likes'}
                                  </Button>
                                )}
                                
                                {/* Add reply to reply button */}
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-5 px-1.5"
                                  onClick={() => handleSetReplyTo(reply)}
                                >
                                  Reply
                                </Button>
                              </div>
                              
                              {/* Display nested replies (replies to replies) */}
                              {reply.replies && reply.replies.length > 0 && (
                                <div className="mt-3 pl-2 space-y-3">
                                  {reply.replies.map((nestedReply) => (
                                    <div 
                                      key={nestedReply.id} 
                                      className={cn(
                                        "border-l-2 pl-2 text-sm",
                                        // Use different border colors based on nesting level
                                        nestedReply.depth === 2 ? "border-[#C4A55C]/40" : 
                                        nestedReply.depth === 3 ? "border-purple-300/40" : 
                                        "border-gray-100"
                                      )}
                                    >
                                      {/* Nested Reply Header */}
                                      <div className="flex items-start gap-2 mb-1">
                                        <Avatar className="h-5 w-5">
                                          <AvatarImage
                                            src={nestedReply.user.profilePicture}
                                            alt={nestedReply.user.displayName}
                                          />
                                          <AvatarFallback>{nestedReply.user.displayName[0]}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                          <h6 className="font-medium text-xs">{nestedReply.user.displayName}</h6>
                                          <p className="text-xs text-gray-500">
                                            {formatDate(nestedReply.createdAt)}
                                          </p>
                                        </div>
                                      </div>
                                      
                                      {/* Nested Reply Body */}
                                      <div className="pl-7">
                                        <p className="text-gray-800 text-xs mb-1">{nestedReply.text}</p>
                                        
                                        {/* Nested Reply Actions */}
                                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className={cn(
                                              "h-4 px-1",
                                              nestedReply.isLikedByMe ? "text-red-500" : "text-gray-500"
                                            )}
                                            onClick={() => handleLikeComment(nestedReply)}
                                          >
                                            <Heart 
                                              className="h-2.5 w-2.5 mr-1" 
                                              fill={nestedReply.isLikedByMe ? "currentColor" : "none"} 
                                            />
                                            Like
                                          </Button>
                                          
                                          {/* Like count for nested replies */}
                                          {nestedReply.likes.length > 0 && (
                                            <Button 
                                              variant="ghost" 
                                              size="sm" 
                                              className="h-4 p-0 text-xs text-gray-500 hover:bg-transparent"
                                              onClick={() => fetchCommentLikes(nestedReply.id)}
                                            >
                                              {nestedReply.likes.length} {nestedReply.likes.length === 1 ? 'like' : 'likes'}
                                            </Button>
                                          )}
                                          
                                          {/* Add reply to nested reply button */}
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-4 px-1"
                                            onClick={() => handleSetReplyTo(nestedReply)}
                                          >
                                            Reply
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Floating Reply Box */}
      {replyTo && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg p-4 z-50 transform transition-all duration-300 ease-in-out" 
             style={{
               transform: replyTo ? 'translateY(0)' : 'translateY(100%)',
               opacity: replyTo ? 1 : 0
             }}>
          <div className="max-w-screen-md mx-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600 flex items-center">
                <span>Replying to </span>
                <span className="font-medium ml-1">{replyTo.user.displayName}</span>
                <span className="ml-2 text-xs text-gray-500 italic">
                  &ldquo;{replyTo.text.length > 60 ? `${replyTo.text.substring(0, 60)}...` : replyTo.text}&rdquo;
                </span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-gray-500"
                onClick={() => {
                  setReplyTo(null);
                  setCommentText("");
                }}
              >
                Cancel
              </Button>
            </div>
            
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={currentUser?.photoURL || undefined}
                  alt={currentUser?.displayName || "User"}
                />
                <AvatarFallback>{currentUser?.displayName?.[0] || "U"}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={`Reply to ${replyTo.user.displayName}...`}
                  className="resize-none bg-white"
                  disabled={!currentUser || submittingComment}
                  autoFocus
                />
                <div className="flex justify-end mt-2">
                  <Button
                    className="bg-[#0A5C36] hover:bg-[#084026]"
                    size="sm"
                    disabled={!commentText.trim() || !currentUser || submittingComment}
                    onClick={handleCommentSubmit}
                  >
                    {submittingComment ? (
                      <>
                        <Spinner size="sm" variant="white" className="mr-2" />
                        Replying...
                      </>
                    ) : "Reply"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  )
}