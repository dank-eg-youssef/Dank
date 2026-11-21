# ERA Security Specification

## 1. Data Invariants
1. **PII Isolation**: User emails are stored strictly in `/users_private/{userId}` and are readable only by the document owner or verified admin (`youssefdankapp@gmail.com`). `/users_public/{userId}` contains zero PII.
2. **Master Gate Membership**: Subcollections under `/chats/{chatId}` (`messages`, `reactions`, `typing`, `members`) derive access from `/chats/{chatId}/members/{request.auth.uid}`.
3. **Channel Broadcast Integrity**: Only chat admins (`role == 'admin'`) may create messages in a chat of `type == 'channel'`. Regular members can read and react.
4. **Message Status Forward-Only Transitions**: Only non-sender chat members may update message `status` (`sent -> delivered`, `sent -> seen`, `delivered -> seen`), and no other fields except `status` and `updatedAt`.
5. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must match `request.time`.
6. **Verified Admin Gate**: Admin dashboard access (`isAdmin()`) requires `request.auth.token.email == 'youssefdankapp@gmail.com'` AND `request.auth.token.email_verified == true`.
7. **Atomic Join & Count Sync**: Joining a group/channel and incrementing `memberCount` requires `existsAfter` verification on the member record.

## 2. The Dirty Dozen Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated write to `/users_public/{uid}`.
2. Unverified email user (`email_verified: false`) pretending to be `youssefdankapp@gmail.com` reading `/users_private`.
3. Non-owner reading `/users_private/{otherUid}`.
4. Ghost field injection (`isAdmin: true`) on `/users_public/{uid}`.
5. Oversized ID (`1500` chars) on `/chats/{chatId}`.
6. Spoofed `senderId` on `/chats/{chatId}/messages/{msgId}` (`senderId != request.auth.uid`).
7. Non-admin member posting a message to a `channel` chat.
8. Non-member attempting to read or list `/chats/{privateDmId}/messages`.
9. Sender reverting message `status` backward from `'seen'` to `'sent'`.
10. Client-forged `createdAt` timestamp not equal to `request.time`.
11. Unbounded `dmPeerIds` array (`size > 2`) on `/chats/{chatId}`.
12. Non-member listing `/user_chats` with `uid != request.auth.uid`.
