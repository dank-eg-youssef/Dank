import type { Timestamp } from 'firebase/firestore';

export type ChatType = 'private' | 'group' | 'channel';
export type MessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'file'
  | 'location'
  | 'sticker';
export type MessageStatus = 'sent' | 'delivered' | 'seen';
export type MemberRole = 'admin' | 'member';
export type AppLanguage = 'ar' | 'en';
export type AppThemeId = 'arcade';
export type PrivacyVisibility = 'everyone' | 'contacts' | 'nobody';

export interface UserPublic {
  uid: string;
  name: string;
  username: string;
  photoURL?: string;
  coverURL?: string;
  bio?: string;
  language?: AppLanguage;
  theme?: AppThemeId;
  isOnline: boolean;
  lastSeen: Timestamp | null;
  activeChatId?: string;
  isAdmin?: boolean;
  isVerified?: boolean;
  isBot?: boolean;
  isPlus?: boolean;
  inviteCode?: string;
  invitedBy?: string;
  inviteCount?: number;
  isVip?: boolean;
  isBanned?: boolean;
  mutedUntil?: Timestamp | null;
  // Privacy Settings (visibility flags stored cleanly on public profile)
  hasPhone?: boolean;
  privacyPhone?: PrivacyVisibility;
  privacyLastSeen?: PrivacyVisibility;
  privacyLastSeenExceptions?: string[];
  privacyProfilePhoto?: PrivacyVisibility;
  privacyGroupAdd?: 'everyone' | 'contacts';
  privacyCall?: PrivacyVisibility;
  privacyMessages?: 'everyone' | 'contacts';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UserPrivate {
  uid: string;
  email: string;
  phone?: string;
  twoStepEnabled?: boolean;
  twoStepPasswordHash?: string;
  twoStepCodeHash?: string;
  twoStepHint?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UserChatPref {
  chatId: string;
  pinned?: boolean;
  archived?: boolean;
  muted?: boolean;
  unreadClearedAt?: Timestamp | null;
  deletedAt?: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UserContact {
  uid: string;
  name: string;
  username: string;
  photoURL?: string;
  addedAt: Timestamp | null;
}

export interface BlockedUser {
  uid: string;
  name: string;
  username: string;
  blockedAt: Timestamp | null;
}

export interface ActiveSession {
  id: string;
  deviceName: string;
  platform: string;
  userAgent: string;
  lastActiveAt: Timestamp | null;
  createdAt: Timestamp | null;
  revoked?: boolean;
}

export interface CallRecord {
  id: string;
  callerId: string;
  callerName: string;
  callerPhoto?: string;
  calleeId: string;
  calleeName: string;
  calleePhoto?: string;
  chatId: string;
  callType: 'voice' | 'video';
  status: 'ringing' | 'connected' | 'ended' | 'declined' | 'missed';
  offerSdp?: string;
  answerSdp?: string;
  startedAt: Timestamp | null;
  endedAt?: Timestamp | null;
  durationSeconds?: number;
}

export interface CallIceCandidate {
  id: string;
  senderId: string;
  candidate: string;
  createdAt: Timestamp | null;
}

export interface ChannelComment {
  id: string;
  chatId: string;
  messageId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  text: string;
  createdAt: Timestamp | null;
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
  isSecret?: boolean;
  selfDestructSeconds?: number;
  bannedMemberIds?: string[];
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
  unreadCount?: number;
  isOfficial?: boolean;
  isBot?: boolean;
  isOnline?: boolean;
  bio?: string;
  username?: string;
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
  imageUrl?: string;
  imageData?: string;
  audioUrl?: string;
  audioData?: string;
  audioDuration?: number;
  waveform?: number[];
  playedBy?: string[];
  fileName?: string;
  fileSize?: number;
  fileData?: string;
  videoData?: string;
  videoDuration?: number;
  locationLat?: number;
  locationLng?: number;
  locationLabel?: string;
  stickerId?: string;
  forwardedFromName?: string;
  isEdited?: boolean;
  deletedFor?: string[];
  viewCount?: number;
  isEncrypted?: boolean;
  expiresAt?: Timestamp | null;
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

export interface SystemSettings {
  id: string;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  allowSignups: boolean;
  globalNoticeEnabled: boolean;
  globalNoticeText?: string;
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
  storiesCount?: number;
  callsCount?: number;
  connectedCallsCount?: number;
  missedCallsCount?: number;
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
  itemType: 'post';
  targetId: string;
  createdAt: Timestamp | null;
}

export type NotificationType = 'follow' | 'like' | 'comment' | 'message';

export interface AppNotification {
  id: string;
  recipientUid: string;
  actorUid: string;
  actorName: string;
  actorPhoto?: string;
  type: NotificationType;
  text: string;
  targetId?: string;
  read: boolean;
  createdAt: Timestamp | null;
}

export interface UserSticker {
  id: string;
  uid: string;
  source: 'custom' | 'pack' | 'saved';
  stickerId?: string;
  packId?: string;
  imageUrl?: string;
  label?: string;
  createdAt: Timestamp | null;
}

export interface ScheduledMessage {
  id: string;
  uid: string;
  chatId: string;
  chatTitle?: string;
  text: string;
  scheduledAt: Timestamp;
  status: 'pending' | 'sent' | 'cancelled';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ChatReminder {
  id: string;
  uid: string;
  chatId: string;
  chatTitle: string;
  note?: string;
  remindAt: Timestamp;
  status: 'pending' | 'fired' | 'dismissed';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

