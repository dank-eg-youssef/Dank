import type { Timestamp } from 'firebase/firestore';

export type ChatType = 'private' | 'group' | 'channel';
export type MessageType = 'text' | 'image' | 'audio';
export type MessageStatus = 'sent' | 'delivered' | 'seen';
export type MemberRole = 'admin' | 'member';
export type AppLanguage = 'ar' | 'en';

export interface UserPublic {
  uid: string;
  name: string;
  username: string;
  photoURL?: string;
  bio?: string;
  language?: AppLanguage;
  isOnline: boolean;
  lastSeen: Timestamp | null;
  activeChatId?: string;
  isAdmin?: boolean;
  isVerified?: boolean;
  inviteCode?: string;
  invitedBy?: string;
  inviteCount?: number;
  isVip?: boolean;
  isBanned?: boolean;
  mutedUntil?: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UserPrivate {
  uid: string;
  email: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  mediaType: 'image' | 'video';
  mediaData: string;
  caption?: string;
  chunkCount?: number;
  videoDuration?: number;
  createdAt: Timestamp | null;
  expiresAt: Timestamp | null;
}

export interface StoryView {
  uid: string;
  viewerName: string;
  viewerPhoto?: string;
  emoji?: string;
  viewedAt: Timestamp | null;
}

export interface Chat {
  id: string;
  type: ChatType;
  name?: string;
  description?: string;
  photoURL?: string;
  isPublic: boolean;
  createdBy: string;
  dmPeerIds?: string[];
  lastMessageText?: string;
  lastMessageType?: '' | MessageType;
  lastMessageSenderId?: string;
  lastMessageSenderName?: string;
  lastMessageStatus?: '' | MessageStatus;
  lastMessageAt?: Timestamp | null;
  pinnedMessageId?: string;
  pinnedMessageText?: string;
  pinnedMessageSenderName?: string;
  memberCount: number;
  messages24hCount?: number;
  messages24hWindowStart?: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ChatMember {
  uid: string;
  chatId: string;
  role: MemberRole;
  joinedAt: Timestamp | null;
  lastReadAt: Timestamp | null;
}

export interface UserChatRef {
  uid: string;
  chatId: string;
  chatType: ChatType;
  joinedAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  type: MessageType;
  text?: string;
  imageData?: string;
  audioData?: string;
  audioDuration?: number;
  waveform?: number[];
  status: MessageStatus;
  replyToId?: string;
  replyToSenderName?: string;
  replyToText?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Reaction {
  messageId: string;
  chatId: string;
  uid: string;
  userName: string;
  emoji: string;
  updatedAt: Timestamp | null;
}

export interface TypingState {
  uid: string;
  name: string;
  isTyping: boolean;
  updatedAt: Timestamp | null;
}

export interface MutedChat {
  chatId: string;
  muted: boolean;
  updatedAt: Timestamp | null;
}

export interface AdsBanner {
  id: string;
  enabled: boolean;
  text: string;
  link?: string;
  imageData?: string;
  updatedBy?: string;
  updatedAt: Timestamp | null;
}

export interface AdminActiveUserStat {
  uid: string;
  name: string;
  username: string;
  photoURL?: string;
  isAdmin?: boolean;
  isVerified?: boolean;
  isVip?: boolean;
  messageCount: number;
}

export interface AdminActiveGroupStat {
  id: string;
  name: string;
  photoURL?: string;
  memberCount: number;
  messageCount: number;
  messages24h: number;
}

export interface AdminDailyStat {
  label: string;
  messages: number;
  newUsers: number;
}

export interface AdminStatsData {
  totalUsers: number;
  totalMessages: number;
  totalGroups: number;
  totalChannels: number;
  totalPrivateChats: number;
  newUsersToday: number;
  totalMessagesToday: number;
  mostActiveUsers: AdminActiveUserStat[];
  mostActiveGroups: AdminActiveGroupStat[];
  dailyActivity: AdminDailyStat[];
  users: UserPublic[];
  chats: Chat[];
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorPhoto?: string;
  authorIsAdmin?: boolean;
  authorIsVerified?: boolean;
  authorIsVip?: boolean;
  images: string[];
  caption?: string;
  hashtags?: string[];
  likeCount: number;
  commentCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Reel {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorPhoto?: string;
  authorIsAdmin?: boolean;
  authorIsVerified?: boolean;
  authorIsVip?: boolean;
  videoUrl: string;
  chunkCount?: number;
  videoDuration?: number;
  caption?: string;
  musicName?: string;
  hashtags?: string[];
  likeCount: number;
  commentCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface FeedComment {
  id: string;
  targetId: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorPhoto?: string;
  authorIsAdmin?: boolean;
  authorIsVerified?: boolean;
  authorIsVip?: boolean;
  text: string;
  replyToId?: string;
  replyToAuthorName?: string;
  likeCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface FollowRelation {
  followerUid: string;
  targetUid: string;
  createdAt: Timestamp | null;
}

export interface SavedItem {
  id: string;
  itemType: 'post' | 'reel';
  targetId: string;
  createdAt: Timestamp | null;
}

