import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { SeoService, SITEMAP_KINDS, type SitemapKind } from './seo.service.js';

@Controller()
export class SeoController {
  constructor(@Inject(SeoService) private readonly seoService: SeoService) {}

  // The site map index, served at /sitemap.xml by the proxy.
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiResponse({ status: 200, type: String })
  async getSitemap() {
    return this.seoService.generateSitemapIndex();
  }

  // One part of the site map, served at /sitemap-<kind>-<page>.xml.
  @Get('sitemap/:kind/:page')
  @Header('Content-Type', 'application/xml')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiResponse({ status: 200, type: String })
  async getSitemapPart(
    @Param('kind') kind: string,
    @Param('page', ParseIntPipe) page: number,
  ) {
    const part = (SITEMAP_KINDS as readonly string[]).includes(kind)
      ? await this.seoService.generateSitemapPart(kind as SitemapKind, page)
      : null;
    if (!part) throw new NotFoundException();
    return part;
  }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain')
  @ApiResponse({ status: 200, type: String })
  getRobotsTxt() {
    return this.seoService.generateRobotsTxt();
  }

  @Get('og')
  @Header('Content-Type', 'text/html')
  @ApiResponse({ status: 200, type: String })
  async getOpenGraphHtml(@Query('path') path: string) {
    if (!path) {
      path = '/';
    }
    return this.seoService.generateOpenGraphHtml(path);
  }

  @Get('og-image/post/:id')
  @Header('Content-Type', 'image/svg+xml')
  @ApiResponse({ status: 200, type: String })
  async getPostOgImage(@Param('id') id: string) {
    return this.seoService.generatePostOgImage(id);
  }

  @Get('og-image/profile/:username')
  @Header('Content-Type', 'image/svg+xml')
  @ApiResponse({ status: 200, type: String })
  async getProfileOgImage(@Param('username') username: string) {
    return this.seoService.generateProfileOgImage(username);
  }
}
