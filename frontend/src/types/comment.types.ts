export type CommentEntityType = 'QUOTE' | 'ORDER' | 'WORK_ORDER' | 'EXPENSE_ORDER';

export interface CommentAuthor {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  profilePhoto: string | null;
}

export interface CommentReply {
  id: string;
  content: string;
  parentId: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
}

export interface Comment {
  id: string;
  content: string;
  entityType: CommentEntityType;
  entityId: string;
  parentId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: CommentAuthor;
  replies: CommentReply[];
}

export interface CreateCommentDto {
  content: string;
  entityType: CommentEntityType;
  entityId: string;
  parentId?: string;
}
