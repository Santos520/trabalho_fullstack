# Modelo Entidade-Relacionamento — GameVault

O sistema tem cinco entidades persistidas no PostgreSQL: administradores, clientes, jogos, empréstimos e avaliações. Empréstimos e avaliações ligam clientes aos jogos; a decisão do empréstimo também referencia o administrador que a tomou.

```mermaid
erDiagram
    ADMIN ||--o{ BOOKING : analisa
    CLIENT ||--o{ BOOKING : solicita
    GAME ||--o{ BOOKING : reservado_em
    CLIENT ||--o{ REVIEW : escreve
    GAME ||--o{ REVIEW : recebe

    ADMIN {
        string id PK
        string name
        string email UK
        string password_hash
    }
    CLIENT {
        string id PK "UUID para novos cadastros"
        string name
        string email UK
        string password_hash
    }
    GAME {
        string id PK
        string title
        string category
        string platform
        integer release_year
        boolean featured
        json payload
    }
    BOOKING {
        string id PK
        string client_id FK
        string game_id FK
        date booking_date
        string status
        string reviewed_by FK
        json payload
    }
    REVIEW {
        string id PK
        string client_id FK
        string game_id FK
        integer rating
        string comment
        string reply
        json payload
    }
```

O DDL executável está em [schema.sql](../db/schema.sql). IDs administrativos legados são mantidos como `TEXT`; novos clientes continuam recebendo UUIDs no backend.
