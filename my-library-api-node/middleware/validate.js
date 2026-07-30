const { ZodError } = require('zod');

/**
 * Validate Middleware — ตรวจสอบ Input ด้วย Zod Schema
 * 
 * @param {Object} schemas - Object ที่มี key เป็น body, params, query
 * @returns Express middleware function
 * 
 * Usage:
 *   const { z } = require('zod');
 *   const schema = { body: z.object({ name: z.string().min(1) }) };
 *   app.post('/api/example', validate(schema), handler);
 */
function validate(schemas) {
    return (req, res, next) => {
        try {
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            if (schemas.params) {
                req.params = schemas.params.parse(req.params);
            }
            if (schemas.query) {
                req.query = schemas.query.parse(req.query);
            }
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
                return res.status(400).json({
                    success: false,
                    message: 'ข้อมูลไม่ถูกต้อง',
                    errors: messages
                });
            }
            next(error);
        }
    };
}

module.exports = validate;
