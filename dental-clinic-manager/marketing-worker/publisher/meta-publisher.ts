// ============================================
// Meta Graph API 발행기 (인스타그램 + 페이스북)
// 하나의 Meta Business 계정으로 둘 다 관리
// ============================================

interface MetaConfig {
  accessToken: string;
  instagramAccountId: string;
  facebookPageId: string;
}

interface PublishResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

export class MetaPublisher {
  private config: MetaConfig;

  constructor(config: MetaConfig) {
    this.config = config;
  }

  /**
   * 인스타그램 단일 이미지 포스트
   */
  async publishInstagramSingle(
    imageUrl: string,
    caption: string
  ): Promise<PublishResult> {
    try {
      // 1. 미디어 컨테이너 생성
      const createRes = await fetch(
        `https://graph.facebook.com/v21.0/${this.config.instagramAccountId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: imageUrl,
            caption,
            access_token: this.config.accessToken,
          }),
        }
      );
      const createData = await createRes.json();
      if (createData.error) throw new Error(createData.error.message);

      // 2. 발행
      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${this.config.instagramAccountId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: createData.id,
            access_token: this.config.accessToken,
          }),
        }
      );
      const publishData = await publishRes.json();
      if (publishData.error) throw new Error(publishData.error.message);

      return {
        success: true,
        postId: publishData.id,
        postUrl: `https://www.instagram.com/p/${publishData.id}/`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 인스타그램 캐러셀 포스트
   */
  async publishInstagramCarousel(
    imageUrls: string[],
    caption: string
  ): Promise<PublishResult> {
    try {
      // 1. 각 이미지의 미디어 컨테이너 생성
      const containerIds: string[] = [];
      for (const url of imageUrls) {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${this.config.instagramAccountId}/media`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_url: url,
              is_carousel_item: true,
              access_token: this.config.accessToken,
            }),
          }
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        containerIds.push(data.id);
      }

      // 2. 캐러셀 컨테이너 생성
      const carouselRes = await fetch(
        `https://graph.facebook.com/v21.0/${this.config.instagramAccountId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'CAROUSEL',
            children: containerIds,
            caption,
            access_token: this.config.accessToken,
          }),
        }
      );
      const carouselData = await carouselRes.json();
      if (carouselData.error) throw new Error(carouselData.error.message);

      // 3. 발행
      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${this.config.instagramAccountId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: carouselData.id,
            access_token: this.config.accessToken,
          }),
        }
      );
      const publishData = await publishRes.json();
      if (publishData.error) throw new Error(publishData.error.message);

      return {
        success: true,
        postId: publishData.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 페이스북 페이지 포스트 (텍스트 + 링크)
   */
  async publishFacebook(
    message: string,
    link?: string
  ): Promise<PublishResult> {
    try {
      const body: Record<string, string> = {
        message,
        access_token: this.config.accessToken,
      };
      if (link) body.link = link;

      const res = await fetch(
        `https://graph.facebook.com/v21.0/${this.config.facebookPageId}/feed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      return {
        success: true,
        postId: data.id,
        postUrl: `https://www.facebook.com/${data.id}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
