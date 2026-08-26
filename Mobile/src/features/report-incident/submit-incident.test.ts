import { describe, expect, test, vi } from 'vitest';

import { createApiClient } from '@/api/client';

import type { SelectedIncidentImage } from './selected-image';
import { submitIncidentWithOptionalImage } from './submit-incident';

const client = createApiClient({ origin: 'https://api.example.test' });
const image: SelectedIncidentImage = {
  fileName: 'problem.jpg',
  height: 1200,
  mimeType: 'image/jpeg',
  sizeBytes: 1024,
  uri: 'file:///cache/problem.jpg',
  width: 1600,
};
const request = {
  adres_zgloszenia: 'ul. Testowa 12',
  latitude: null,
  longitude: null,
  mail_zglaszajacego: 'resident@example.com',
  opis_zgloszenia: 'Uszkodzona nawierzchnia',
  typ_sluzby: 'roads',
  zdjecie_incydentu_zglaszanego_upload_id: null,
} as const;
const upload = {
  expiresAt: '2030-01-01T00:00:00.000Z',
  headers: { 'content-type': 'image/jpeg' },
  method: 'PUT' as const,
  uploadId: 'd75d89fc-c748-4cfc-a3e6-7c671aa36c3b',
  uploadUrl: 'https://uploads.example.test/problem.jpg?signature=test',
};

describe('incident submission with an optional image', () => {
  test('uploads the image before creating an incident with its upload ID', async () => {
    const order: string[] = [];
    const create = vi.fn(() => {
      order.push('create');
      return Promise.resolve(undefined as never);
    });

    await submitIncidentWithOptionalImage({
      client,
      dependencies: {
        checksumImage: async () => {
          order.push('checksum');
          return { checksumSha256: 'a'.repeat(64), mimeType: 'image/jpeg', sizeBytes: 1024 };
        },
        create,
        initiateUpload: async () => {
          order.push('initiate');
          return upload;
        },
        uploadImage: async () => {
          order.push('upload');
        },
      },
      image,
      request,
    });

    expect(order).toEqual(['checksum', 'initiate', 'upload', 'create']);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          zdjecie_incydentu_zglaszanego_upload_id: upload.uploadId,
        }),
      }),
    );
  });

  test('does not create an incident when the binary upload fails', async () => {
    const create = vi.fn(() => Promise.resolve(undefined as never));

    await expect(
      submitIncidentWithOptionalImage({
        client,
        dependencies: {
          checksumImage: async () => ({
            checksumSha256: 'a'.repeat(64),
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          }),
          create,
          initiateUpload: async () => upload,
          uploadImage: async () => {
            throw new Error('upload failed');
          },
        },
        image,
        request,
      }),
    ).rejects.toThrow('upload failed');
    expect(create).not.toHaveBeenCalled();
  });
});
