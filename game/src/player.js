// player.js — first-person movement: acceleration + friction, crouch, and AABB
// collision against the map. The camera eye height lives here; main.js reads it.

import { resolveCircle } from './map.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;
const RADIUS = 0.42;
const ACCEL = 42;
const FRICTION = 10;
const SPEED_WALK = 5.4;
const SPEED_CROUCH = 2.7;

export function createPlayer(colliders, spawn) {
  const body = {
    position: { x: spawn.x, y: 0, z: spawn.z },
    vel: { x: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    eye: EYE_STAND,
    crouched: false,
    recoilPitch: 0,
    recoilYaw: 0,
    stepBob: 0,
  };

  return {
    state: body,
    reset(x, z, yaw = 0) {
      body.position.x = x;
      body.position.z = z;
      body.vel.x = 0;
      body.vel.z = 0;
      body.yaw = yaw;
      body.pitch = 0;
      body.eye = EYE_STAND;
      body.crouched = false;
      body.recoilPitch = 0;
      body.recoilYaw = 0;
    },
    look(dx, dy) {
      body.yaw -= dx * 0.0021;
      body.pitch -= dy * 0.0021;
      const limit = 1.53;
      if (body.pitch > limit) body.pitch = limit;
      if (body.pitch < -limit) body.pitch = -limit;
    },
    recoil(pitchKick, yawKick) {
      body.recoilPitch += pitchKick;
      body.recoilYaw += yawKick;
    },
    step(dt, keys) {
      body.crouched = keys.has('ControlLeft') || keys.has('ControlRight');
      const targetEye = body.crouched ? EYE_CROUCH : EYE_STAND;
      body.eye += (targetEye - body.eye) * Math.min(1, dt * 12);

      let ix = 0;
      let iz = 0;
      if (keys.has('KeyW')) iz -= 1;
      if (keys.has('KeyS')) iz += 1;
      if (keys.has('KeyA')) ix -= 1;
      if (keys.has('KeyD')) ix += 1;
      const len = Math.hypot(ix, iz);
      if (len > 0) { ix /= len; iz /= len; }

      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      // Forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
      const wx = ix * cos + iz * sin;
      const wz = -ix * sin + iz * cos;
      const maxSpeed = body.crouched ? SPEED_CROUCH : SPEED_WALK;
      body.vel.x += wx * ACCEL * dt;
      body.vel.z += wz * ACCEL * dt;

      // Friction: exponential damping toward rest.
      const damp = Math.exp(-FRICTION * dt);
      body.vel.x *= damp;
      body.vel.z *= damp;
      const speed = Math.hypot(body.vel.x, body.vel.z);
      if (speed > maxSpeed) {
        body.vel.x = (body.vel.x / speed) * maxSpeed;
        body.vel.z = (body.vel.z / speed) * maxSpeed;
      }

      body.position.x += body.vel.x * dt;
      body.position.z += body.vel.z * dt;
      // World bounds + fort colliders.
      if (body.position.x < -58) body.position.x = -58;
      if (body.position.x > 58) body.position.x = 58;
      if (body.position.z < -58) body.position.z = -58;
      if (body.position.z > 58) body.position.z = 58;
      resolveCircle(body.position, RADIUS, colliders);

      // Recoil recovers toward zero.
      body.recoilPitch *= Math.exp(-dt * 7);
      body.recoilYaw *= Math.exp(-dt * 7);
      body.stepBob += speed * dt * 1.6;
    },
    groundSpeed() {
      return Math.hypot(body.vel.x, body.vel.z);
    },
  };
}
