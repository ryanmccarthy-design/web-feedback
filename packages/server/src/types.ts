export interface FeedbackPayload {
  comment: string;
  category?: string;
  email?: string;
  image: string; // Base64 image data URL (data:image/png;base64,...)
  url: string;
  resolution: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  coordinates?: {
    x: number;
    y: number;
    xPercent: number;
    yPercent: number;
  } | null;
  userAgent?: string;
  timestamp?: string;
}

export interface ServiceResult {
  success: boolean;
  message: string;
  error?: string;
}
