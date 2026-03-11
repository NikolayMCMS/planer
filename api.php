<?php
// Простейший API для сохранения данных в локальный файл
header('Content-Type: application/json');

// Получаем JSON данные из тела запроса
$json = file_get_contents('php://input');

if ($json) {
    $data = json_decode($json, true);
    if ($data !== null) {
        // Handle specific actions
        if (isset($data['action'])) {
            if ($data['action'] === 'run_moderation') {
                // В реальности здесь был бы путь к вашему скрипту: shell_exec('python moderation.py');
                // Для демо просто возвращаем успешный ответ и имитируем работу
                $output = "Python environment: OK\nLoading moderation.py...\nChecking tasks...\nNo issues found.\nModeration finished.";
                echo json_encode(['success' => true, 'output' => $output]);
                exit;
            }
        }

        // Default: save database.json
        if (file_put_contents('database.json', json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE))) {
            echo json_encode(['success' => true, 'message' => 'Данные успешно сохранены в database.json']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Ошибка записи в файл.']);
        }
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Некорректный JSON']);
    }
} else {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Данные не получены']);
}
?>
