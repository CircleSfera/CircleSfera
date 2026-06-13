import { Controller, Get, Header, Inject } from '@nestjs/common';
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
}
