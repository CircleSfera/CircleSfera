import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { SeoService } from './seo.service.js';

@Controller()
export class SeoController {
  constructor(@Inject(SeoService) private readonly seoService: SeoService) {}

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml')
  async getSitemap() {
    return this.seoService.generateSitemap();
  }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain')
  getRobotsTxt() {
    return this.seoService.generateRobotsTxt();
  }

  @Get('og')
  @Header('Content-Type', 'text/html')
  async getOpenGraphHtml(@Query('path') path: string) {
    if (!path) {
      path = '/';
    }
    return this.seoService.generateOpenGraphHtml(path);
  }
}
