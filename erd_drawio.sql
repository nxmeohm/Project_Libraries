CREATE TABLE users (
    id INT PRIMARY KEY,
    student_id VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    email VARCHAR(255),
    password VARCHAR(255),
    role VARCHAR(50)
);

CREATE TABLE equipments (
    equipment_id INT PRIMARY KEY,
    name VARCHAR(255),
    category VARCHAR(255),
    image_url VARCHAR(255),
    description TEXT,
    total_quantity INT
);

CREATE TABLE equipment_items (
    item_id INT PRIMARY KEY,
    equipment_id INT,
    kit_code VARCHAR(255),
    status VARCHAR(50)
);

CREATE TABLE borrowed (
    id INT PRIMARY KEY,
    user_id INT,
    equipment_id INT,
    borrow_date DATETIME,
    return_date DATETIME,
    due_date DATETIME,
    status VARCHAR(50),
    qr_code VARCHAR(255)
);

CREATE TABLE queues (
    id INT PRIMARY KEY,
    user_id INT,
    equipment_id INT,
    queue_date DATETIME,
    status VARCHAR(50),
    expires_at DATETIME
);

CREATE TABLE announcements (
    id INT PRIMARY KEY,
    admin_id INT,
    title VARCHAR(255),
    message TEXT,
    target_type VARCHAR(50),
    target_user_id INT,
    created_at DATETIME
);

CREATE TABLE notifications (
    id INT PRIMARY KEY,
    user_id INT,
    type VARCHAR(50),
    message TEXT,
    is_read BOOLEAN,
    created_at DATETIME
);

ALTER TABLE equipment_items ADD CONSTRAINT fk_eq_item FOREIGN KEY (equipment_id) REFERENCES equipments(equipment_id);
ALTER TABLE borrowed ADD CONSTRAINT fk_borrowed_user FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE borrowed ADD CONSTRAINT fk_borrowed_eq FOREIGN KEY (equipment_id) REFERENCES equipments(equipment_id);
ALTER TABLE queues ADD CONSTRAINT fk_queues_user FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE queues ADD CONSTRAINT fk_queues_eq FOREIGN KEY (equipment_id) REFERENCES equipments(equipment_id);
ALTER TABLE announcements ADD CONSTRAINT fk_ann_admin FOREIGN KEY (admin_id) REFERENCES users(id);
ALTER TABLE announcements ADD CONSTRAINT fk_ann_target FOREIGN KEY (target_user_id) REFERENCES users(id);
ALTER TABLE notifications ADD CONSTRAINT fk_noti_user FOREIGN KEY (user_id) REFERENCES users(id);
