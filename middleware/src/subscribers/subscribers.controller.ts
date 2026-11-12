import { Body, Controller, Post } from '@nestjs/common';
import { CreateSubscriberDto } from './dto/create-subscriber.dto.js';
import { SubscribersService } from './subscribers.service.js';

@Controller('subscribers')
export class SubscribersController {
  constructor(private readonly subscribers: SubscribersService) {}

  @Post()
  create(@Body() dto: CreateSubscriberDto) {
    return this.subscribers.create(dto);
  }
}
