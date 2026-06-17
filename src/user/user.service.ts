import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: bigint) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      createdAt: user.createdAt,
    };
  }

  async updateMe(userId: bigint, updateUserDto: UpdateUserDto) {
    const { fullName, phone } = updateUserDto;

    // Validate that at least one field is provided
    if (!fullName && !phone) {
      throw new BadRequestException('At least one field must be provided');
    }

    await (this.prisma as any).user.update({
      where: { id: userId },
      data: {
        ...(fullName && { fullName }),
        ...(phone && { phone }),
        updatedAt: new Date(),
      },
    });
  }
}
