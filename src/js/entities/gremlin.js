
import { tileCollisionCheck, rand, randFloat, Rectangle, lightRadial, playSound, choice } from "../core/utils";
import Splode from "../gfx/Splode";
import Powerup from "./Powerup";
import Particle from './particle.js';
import Arm from "./arm";

export default class Gremlin {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 8;
        this.height = 10;
        this.oldX = x;
        this.oldY = y;
        this.alive = true;
        this.health = 30;
        this.velocity = {x: 0, y: 0};
        this.acceleration = {x: 0, y: 0};
        this.drag = 0.8;
        this.speed = 0.25;
        this.maxSpeed = 0.3;
        this.attackRange = 30;
        this.attackCooldown = 1000;
        this.attackTelegraphTime = 500;
        this.isAttacking = false;
        this.attackBox = new Rectangle(0, 0, 0, 0);
        this.lastAttackTime = 0;
        this.telegraphStartTime = 0;
        this.damage = 10;
        this.isFiring = false;
        this.rectangle = new Rectangle(this.x, this.y, this.width, this.height);
        this.currentRoom = null;
        this.angleToPlayer = 0;

        this.targetTypes = {
            PLAYER: 1,
            TORCH: 2
        };
        this.target = {
            type: this.targetTypes.PLAYER,
            x: player.x,
            y: player.y
        };

         // Create legs as Arms with 2 Segments each
        this.legs = [
            new Arm(this.x, this.y + this.height), // Left leg
            new Arm(this.x, this.y + this.height), // Right leg
            new Arm(this.x, this.y + this.height), // Left leg
            new Arm(this.x, this.y + this.height)  // Right leg
        ];

        // Add segments to each leg
        this.legs.forEach(leg => {
            leg.addSegment(6); // Upper segment
            leg.addSegment(6); // Lower segment
            leg.addSegment(6); // Lower segment
        });

        this.legTargets = [{ x: this.x, y: this.y }, { x: this.x, y: this.y },
            {x: this.x, y: this.y }, { x: this.x, y: this.y }];
        //this.stepDistance = 10; // Minimum distance before a leg takes a step
        //this.legStepOffset = 120; // Offset in frames for alternating leg movement
        this.stepFrameCount = 0; // Counter for alternating legs
    }

    draw(r, view) {
        if (!this.alive) return;
        //laser sight if about to attack
        if (this.isAttacking) {
            r.line(this.x-view.x, this.y-view.y, player.x-view.x, player.y-view.y, choice([10,11,12,13]));
        }

        //body
        r.fRect(this.x - view.x, this.y - view.y, 8, 10, 16, 16);

        lightRadial(this.x - view.x, this.y - view.y, 30, [2, 4]);

        const hornColor = this.isAttacking ? choice([10,11,12,13]) : 16;
        r.fRect(this.x - view.x - 2, this.y - view.y - 2, 2, 4, hornColor);
        r.fRect(this.x - view.x + 6, this.y - view.y - 2, 2, 4, hornColor);

        // Draw the legs
        this.legs.forEach(leg => leg.segments.forEach(segment => {
            r.line(segment.x - view.x, segment.y - view.y, segment.getEndX() - view.x, segment.getEndY() - view.y, 16);
        }));

        r.text(`${this.health}`, this.x - view.x, this.y - view.y - 16, 1, 1, 'center', 'top', 1, 22);

        // //debug rectangle
        // r.fRect(this.x - view.x, this.y - view.y, this.width, this.height, 10);
        // //debug corners
        // r.fRect(this.x - view.x, this.y - view.y, 1, 1, 10);
        // r.fRect(this.x - view.x + this.width, this.y - view.y, 1, 1, 11);
        // r.fRect(this.x - view.x, this.y - view.y + this.height, 1, 1, 12);

    }

    update() {
        if (!this.alive) return;
        this.angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
        if(this.currentRoom !== player.currentRoom) {
            if(this.target.type === this.targetTypes.TORCH) {
                this.target.type = this.targetTypes.PLAYER;
            }
            this.currentRoom = player.currentRoom;
        }

        // Check for collision with player's attack box and apply damage
        this.checkPlayerAttack();

        if (this.health <= 0) {
            this.die();
        }

        const now = Date.now();

        if (this.isAttacking) {
            let timeRemaining = this.attackTelegraphTime - (now - this.telegraphStartTime);
            if (timeRemaining <= 0) {
                this.performAttack();
            }
            return;
        }

        this.oldX = this.x;
        this.oldY = this.y;

        // Seek out the target (player or lit torch)
        this.seekTarget();

        // Check for collision with player's attack box and apply damage
        this.checkPlayerAttack();

        this.seekWithObstacleAvoidance();

        this.determineDirection();

        // Update leg positions
        this.updateLegTargets();
        this.stepFrameCount++;

        // Update the legs
        this.legs.forEach((leg, index) => {
            //4 legs, attach to roughly the corners of the gremlin
            leg.x = this.x + index * 3;
            leg.y = this.y + this.height + index % 2 * 3; 
            leg.target = this.legTargets[index]; // Update target

            // Update leg if the step frame count is appropriate
            if (this.stepFrameCount > this.legStepOffset * index) {
                leg.update();
            }
        });

        // Initiate attack telegraph if within range and cooldown passed
        const distanceToTarget = Math.hypot(this.target.x - this.x, this.target.y - this.y);
        if (distanceToTarget <= this.attackRange && now - this.lastAttackTime >= this.attackCooldown) {
            this.startAttackTelegraph();
        } else {
            this.randomWander();
        }

        this.collideWithPlayer();



        this.applyMovement();
    }

    determineDirection() {
        if (this.velocity.x !== 0 || this.velocity.y !== 0) {
            const magnitude = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y);
            const normalizedX = this.velocity.x / magnitude;
            const normalizedY = this.velocity.y / magnitude;

            if (Math.abs(normalizedX) > Math.abs(normalizedY)) {
                this.direction = normalizedX > 0 ? 'right' : 'left';
            } else {
                this.direction = normalizedY > 0 ? 'down' : 'up';
            }
        }
    }

    updateLegTargets() {
        const offset = 12; // Distance ahead of the player for the leg targets
        const verticalOffset = 6; // Vertical offset for the leg targets
        let targetX, targetY;
        this.stepDistance = 30; // Minimum distance before a leg takes a step
        this.legStepOffset = 15; // Offset in frames for alternating leg movement

        switch (this.direction) {
            case 'up':
                targetX = this.x;
                targetY = this.y + this.height + verticalOffset;
                break;
            case 'down':
                targetX = this.x;
                targetY = this.y + this.height + verticalOffset;
                break;
            case 'left':
                targetX = this.x - offset;
                targetY = this.y + this.height + verticalOffset;
                break;
            case 'right':
                targetX = this.x + offset;
                targetY = this.y + this.height + verticalOffset;
                break;
        }

        // Update the targets for each leg only if the player has moved sufficiently
        this.legs.forEach((leg, index) => {
            const legTarget = this.legTargets[index];
            const distance = Math.hypot(targetX - legTarget.x, targetY - legTarget.y);
            if (distance > this.stepDistance) {
                this.legTargets[index] = { x: targetX + (index === 0 ? 0 : 3), y: targetY };
                playSound(sounds.footstep, 1, 0, 0.1)
            }
        });
    }


    collideWithPlayer() {
        if (this.rectangle.intersects(player.rectangle)) {
            player.health -= 1;
            let knockbackForce = 4;
            player.acceleration.x += Math.cos(this.angleToPlayer) * knockbackForce;
            player.acceleration.y += Math.sin(this.angleToPlayer) * knockbackForce;
        }
    }

    checkPlayerAttack() {
        if (player.isFiring && this.rectangle.intersects(player.attackBox)) {
            this.health -= player.attackDamage; 
            let knockbackForce = 12;
            this.acceleration.x -= Math.cos(this.angleToPlayer) * knockbackForce;
            this.acceleration.y -= Math.sin(this.angleToPlayer) * knockbackForce;
           playSound(sounds.gremlinHurt); // Assuming there's a sound effect for hitting
        }
    }

    raycast(x0, y0, x1, y1, map) {
        let dx = Math.abs(x1 - x0);
        let dy = Math.abs(y1 - y0);
        let sx = (x0 < x1) ? 1 : -1;
        let sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;
    
        while (true) {
            if (tileCollisionCheck(map, { x: x0, y: y0, width: 1, height: 1 })) {
                return true; // Collision with a wall
            }
    
            if ((x0 === x1) && (y0 === y1)) break;
            let e2 = err * 2;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    
        return false; // No collision
    }

    seekWithObstacleAvoidance() {
        const dirX = this.target.x - this.x;
        const dirY = this.target.y - this.y;
        const distance = Math.hypot(dirX, dirY);
    
        if (distance > 0) {
            this.acceleration.x = (dirX / distance) * this.speed;
            this.acceleration.y = (dirY / distance) * this.speed;
        }
    
        // Check if there's a wall in the way
        if (this.raycast(this.x, this.y, this.target.x, this.target.y, map)) {
            // There's a wall, so we need to steer around it
            let angleOffset = 0.1; // Angle to try avoiding the wall
    
            // Try turning slightly left
            let leftAngle = Math.atan2(dirY, dirX) - angleOffset;
            let leftX = this.x + Math.cos(leftAngle) * this.speed;
            let leftY = this.y + Math.sin(leftAngle) * this.speed;
    
            if (!this.raycast(this.x, this.y, leftX, leftY, map)) {
                this.acceleration.x = Math.cos(leftAngle) * this.speed;
                this.acceleration.y = Math.sin(leftAngle) * this.speed;
            } else {
                // If turning left didn't work, try turning right
                let rightAngle = Math.atan2(dirY, dirX) + angleOffset;
                let rightX = this.x + Math.cos(rightAngle) * this.speed;
                let rightY = this.y + Math.sin(rightAngle) * this.speed;
    
                if (!this.raycast(this.x, this.y, rightX, rightY, map)) {
                    this.acceleration.x = Math.cos(rightAngle) * this.speed;
                    this.acceleration.y = Math.sin(rightAngle) * this.speed;
                }
            }
        }
    }
    
    

    seekTarget() {
        // If the current room has an altar and it's not anointed, target the nearest torch
        if (player.currentRoom.altar && !player.currentRoom.altar.annointed) {
            let nearestTorch = null;
            let minDistance = Infinity;

            for (const torch of player.currentRoom.altar.torches) {
                const distanceToTorch = Math.hypot(torch.x - this.x, torch.y - this.y);
                if (distanceToTorch < minDistance && torch.health > 0) {
                    nearestTorch = torch;
                    minDistance = distanceToTorch;
                }
            }

            if (nearestTorch) {
                this.target.type = this.targetTypes.TORCH;
                this.target.x = nearestTorch.x;
                this.target.y = nearestTorch.y;

                const dirX = this.target.x - this.x;
                const dirY = this.target.y - this.y;
                const distance = Math.hypot(dirX, dirY);
        
                if (distance > 0) {
                    this.acceleration.x = (dirX / distance) * this.speed;
                    this.acceleration.y = (dirY / distance) * this.speed;
                }

                return;
            }
        }

        // If no torch to target, seek the player
        this.target.type = this.targetTypes.PLAYER;
        this.target.x = player.x;
        this.target.y = player.y;

        const dirX = this.target.x - this.x;
        const dirY = this.target.y - this.y;
        const distance = Math.hypot(dirX, dirY);

        if (distance > 0) {
            this.acceleration.x = (dirX / distance) * this.speed;
            this.acceleration.y = (dirY / distance) * this.speed;
        }
    }

    randomWander() {
        if (Math.random() < 0.1) {
            this.acceleration.x = (Math.random() - 0.5) * this.speed;
            this.acceleration.y = (Math.random() - 0.5) * this.speed;
        }
    }

    startAttackTelegraph() {
        this.isAttacking = true;
        this.telegraphStartTime = Date.now();
        this.acceleration.x = 0;
        this.acceleration.y = 0;
    }

    performAttack() {
        this.isAttacking = false;
        this.lastAttackTime = Date.now();
        // Perform attack logic based on target type
        if (this.target.type === this.targetTypes.PLAYER && !player.isFiring) {
            if (Math.hypot(player.x - this.x, player.y - this.y) <= this.attackRange) {
                player.health -= this.damage; 
               //find angle between player and gremlin
                
                let knockbackForce = 6;
                player.acceleration.x += Math.cos(this.angleToPlayer) * knockbackForce;
                player.acceleration.y += Math.sin(this.angleToPlayer) * knockbackForce;
                playSound(sounds.playerHurt);
                //spawn a bunch of particles along a line between the player and the gremlin
                let i = 100;
                while(i--){
                    entitiesArray.push(new Particle(
                        player.x + randFloat(-2,2), player.y + randFloat(-2,2),
                        randFloat(-0.5,0.5),
                        randFloat(-0.5,0.5),
                        {color: [22,8,7,6,5,4,3,2,1], life: 100,
                        customUpdate: (p) => {
                            p.xVelocity += (Math.random() - 0.5) * 0.3; 
                            p.yVelocity += (Math.random() - 0.5) * 0.3; 
                        }
                    }));
                }

                //playSound('hit'); // Assuming there's a sound effect for hitting
            }
        } else if (this.target.type === this.targetTypes.TORCH) {
            for (const torch of player.currentRoom.altar.torches) {
                if (torch.x === this.target.x && torch.y === this.target.y) {
                    torch.health -= this.damage; // Reduce torch health
                    if (torch.health <= 0) {
                       playSound(sounds.footstep, 0.5, 0, 0.8); // Assuming there's a sound effect for extinguishing torches
                    }
                    break;
                }
            }
        }
    }

    separate(enemy, enemies, desiredSeparation) {
        let steer = { x: 0, y: 0 };
        let count = 0;
    
        // For every nearby enemy, check if it's too close
        for (let other of enemies) {
            let distance = Math.sqrt(
                (enemy.x - other.x) * (enemy.x - other.x) +
                (enemy.y - other.y) * (enemy.y - other.y)
            );
    
            if (distance > 0 && distance < desiredSeparation) {
                // Calculate vector pointing away from the nearby enemy
                let diff = {
                    x: enemy.x - other.x,
                    y: enemy.y - other.y
                };
    
                // Normalize and weight by distance
                diff.x /= distance;
                diff.y /= distance;
                steer.x += diff.x;
                steer.y += diff.y;
                count++;
            }
        }
    
        // Average out the forces and scale
        if (count > 0) {
            steer.x /= count;
            steer.y /= count;
    
            let magnitude = Math.sqrt(steer.x * steer.x + steer.y * steer.y);
            if (magnitude > 0) {
                steer.x /= magnitude;
                steer.y /= magnitude;
    
                steer.x *= enemy.maxSpeed;
                steer.y *= enemy.maxSpeed;
            }
    
            steer.x -= enemy.velocity.x;
            steer.y -= enemy.velocity.y;
        }
    
        return steer;
    }
    

    applyMovement() {
        this.separateForce = this.separate(this, gremlinsArray, 20);

        this.acceleration.x += this.separateForce.x;
        this.acceleration.y += this.separateForce.y;

         // Check for collision with player's attack box and apply damage
         this.checkPlayerAttack();

        this.velocity.x += this.acceleration.x;
        this.velocity.y += this.acceleration.y;

        this.velocity.x *= this.drag;
        this.velocity.y *= this.drag;

               

        this.x += this.velocity.x;
        if(tileCollisionCheck(map, this)) {
            this.x = this.oldX;
            this.velocity.x = 0;
        }

        this.y += this.velocity.y;
        if(tileCollisionCheck(map, this)) {
            this.y = this.oldY;
            this.velocity.y = 0;
        }

        this.rectangle.x = this.x;
        this.rectangle.y = this.y;
    }

    die() {
        this.alive = false;
        entitiesArray.push(new Splode(this.x, this.y, 50, 5));
        let i = rand(2, 5);
        while(i--) {
            entitiesArray.push(new Particle(this.x, this.y, randFloat(-0.1, 0.1), randFloat(-0.1, 0.1), {color: [16, 15, 14, 13, 12, 11], life: 50}));
            entitiesArray.push(new Powerup('GREMLIN_BLOOD', this.x + randFloat(-10, 10), this.y+ randFloat(-10, 10)));
        }
        }
}