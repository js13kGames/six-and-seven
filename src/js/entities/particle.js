import { inView, lightRadial } from '../core/utils.js';

export default class Particle {
    constructor(x, y, xVelocity, yVelocity, options = {}) {
        this.xVelocity = xVelocity;
        this.yVelocity = yVelocity;
        this._color = options._color || 22;
        this.life = options.life || 100;
        this.maxLife = this.life;
        this.drop = options.drop || 0;
        this.dropChance = options.dropChance || 0;
        this.customUpdate = options.customUpdate || null;
        this.x = x;
        this.y = y;
        this.prevX = this.x;
        this.prevY = this.y;
        this.alive = true;

        // Check if _color is an array or a single value
        if (Array.isArray(this._color)) {
            this.colorArray = this._color;
            this._color = this.colorArray[0];
        } else {
            this.colorArray = null;
        }
    }

    update() {
        this.prevX = this.x;
        this.prevY = this.y;
        
        if (!inView({ x: this.x, y: this.y })) {
            this.die();
        }
        
        this.x += this.xVelocity;
        this.y += this.yVelocity;

        if(this.customUpdate) {
            this.customUpdate(this);
        }
        this.life--;

        // Update _color if colorArray is provided
        if (this.colorArray) {
            const colorIndex = Math.floor((1 - this.life / this.maxLife) * (this.colorArray.length - 1));
            this._color = this.colorArray[colorIndex];
        }

        if (!inView({ x: this.x, y: this.y })) {
            this.die();
        }
        if (this.life <= 0) {
            this.die();
        }
    }

    draw(r, view) {
        r.line(this.x - view.x, this.y - view.y, this.prevX - view.x, this.prevY - view.y, this._color);
        lightRadial(this.x - view.x, this.y - view.y, 10 * this.life/this.maxLife , [2,3, 4]);

    }

    die() {
        this.alive = false;
    }
}
