import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
  TEST_UUID,
} from '../common/testing/http-controller.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

describe('TeamController', () => {
  let app: INestApplication;
  const service = {
    team: vi.fn(),
    invite: vi.fn(),
    remove: vi.fn(),
    invitations: vi.fn(),
    memberProfiles: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [TeamController],
      providers: [{ provide: TeamService, useValue: service }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  const http = () => request(app.getHttpServer());

  it('needs a session', async () => {
    await http().get('/api/v1/team').expect(401);
  });

  it('works on the Profile of the session for its owner', async () => {
    service.team.mockResolvedValue({ members: [] });
    service.invite.mockResolvedValue({ id: 'm-1' });
    service.remove.mockResolvedValue({ success: true });

    await http().get('/api/v1/team').set(BEARER).expect(200);
    await http()
      .post('/api/v1/team/members')
      .set(BEARER)
      .send({ username: '@Ana', role: 'EDITOR' })
      .expect(201);
    await http()
      .delete(`/api/v1/team/members/${TEST_UUID}`)
      .set(BEARER)
      .expect(200);

    const { userId, profileId } = TEST_USER;
    expect(service.team).toHaveBeenCalledWith(userId, profileId);
    // The @ is taken off the username.
    expect(service.invite).toHaveBeenCalledWith(userId, profileId, {
      username: 'Ana',
      role: 'EDITOR',
    });
    expect(service.remove).toHaveBeenCalledWith(userId, profileId, TEST_UUID);
  });

  it('refuses a role outside the list and a malformed username', async () => {
    await http()
      .post('/api/v1/team/members')
      .set(BEARER)
      .send({ username: 'ana', role: 'OWNER' })
      .expect(400);
    await http()
      .post('/api/v1/team/members')
      .set(BEARER)
      .send({ username: 'not a name', role: 'EDITOR' })
      .expect(400);
    expect(service.invite).not.toHaveBeenCalled();
  });

  it('answers invitations as the person of the session', async () => {
    service.invitations.mockResolvedValue([]);
    service.accept.mockResolvedValue({ success: true });
    service.decline.mockResolvedValue({ success: true });

    await http().get('/api/v1/team/invitations').set(BEARER).expect(200);
    await http()
      .post(`/api/v1/team/invitations/${TEST_UUID}/accept`)
      .set(BEARER)
      .expect(200);
    await http()
      .post(`/api/v1/team/invitations/${TEST_UUID}/decline`)
      .set(BEARER)
      .expect(200);

    expect(service.invitations).toHaveBeenCalledWith(TEST_USER.userId);
    expect(service.accept).toHaveBeenCalledWith(
      TEST_USER.userId,
      TEST_UUID,
      TEST_USER.signInId,
    );
    expect(service.decline).toHaveBeenCalledWith(TEST_USER.userId, TEST_UUID);
  });

  it('lists the Profiles the person works on as a member', async () => {
    service.memberProfiles.mockResolvedValue([{ id: 'p-shop' }]);
    const res = await http()
      .get('/api/v1/team/profiles')
      .set(BEARER)
      .expect(200);
    expect(res.body).toEqual([{ id: 'p-shop' }]);
    expect(service.memberProfiles).toHaveBeenCalledWith(TEST_USER.userId);
  });

  it('refuses an id that is not one', async () => {
    await http()
      .post('/api/v1/team/invitations/not-an-id/accept')
      .set(BEARER)
      .expect(400);
  });
});
