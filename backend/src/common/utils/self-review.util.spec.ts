import { ForbiddenException } from '@nestjs/common';
import {
  SELF_REVIEW_MESSAGE,
  assertNotSelfReview,
  isForbiddenSelfReview,
} from './self-review.util';

describe('self-review.util', () => {
  const dbWithRole = (name: string | null) => ({
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(name === null ? null : { role: { name } }),
    },
  });

  describe('isForbiddenSelfReview', () => {
    it('allows a different reviewer without looking up roles', async () => {
      const db = dbWithRole('caja');

      await expect(
        isForbiddenSelfReview(db as any, { requestedById: 'u1', reviewerId: 'u2' }),
      ).resolves.toBe(false);
      expect(db.user.findUnique).not.toHaveBeenCalled();
    });

    it('allows when the request has no requester', async () => {
      const db = dbWithRole('caja');

      await expect(
        isForbiddenSelfReview(db as any, { requestedById: null, reviewerId: 'u1' }),
      ).resolves.toBe(false);
    });

    it('forbids a non-admin reviewing their own request', async () => {
      const db = dbWithRole('caja');

      await expect(
        isForbiddenSelfReview(db as any, { requestedById: 'u1', reviewerId: 'u1' }),
      ).resolves.toBe(true);
    });

    it('lets an admin review their own request', async () => {
      const db = dbWithRole('admin');

      await expect(
        isForbiddenSelfReview(db as any, { requestedById: 'u1', reviewerId: 'u1' }),
      ).resolves.toBe(false);
    });

    it('forbids when the reviewer cannot be found', async () => {
      const db = dbWithRole(null);

      await expect(
        isForbiddenSelfReview(db as any, { requestedById: 'u1', reviewerId: 'u1' }),
      ).resolves.toBe(true);
    });
  });

  describe('assertNotSelfReview', () => {
    it('throws ForbiddenException with the shared message', async () => {
      const db = dbWithRole('contabilidad');
      const call = assertNotSelfReview(db as any, {
        requestedById: 'u1',
        reviewerId: 'u1',
      });

      await expect(call).rejects.toThrow(ForbiddenException);
      await expect(
        assertNotSelfReview(db as any, { requestedById: 'u1', reviewerId: 'u1' }),
      ).rejects.toThrow(SELF_REVIEW_MESSAGE);
    });

    it('resolves for a different reviewer', async () => {
      await expect(
        assertNotSelfReview(dbWithRole('caja') as any, {
          requestedById: 'u1',
          reviewerId: 'u2',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
