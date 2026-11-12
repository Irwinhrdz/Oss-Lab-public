import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSubscriberDto {
  @IsString()
  @IsNotEmpty()
  cliente!: string;

  @IsString()
  @IsNotEmpty()
  plan!: string;

  /** Slug del sitio en NetBox que da cobertura al suscriptor. */
  @IsString()
  @IsNotEmpty()
  sitio!: string;
}
