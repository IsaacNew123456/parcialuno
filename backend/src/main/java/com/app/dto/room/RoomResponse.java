package com.app.dto.room;

import com.app.dto.DiagramResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RoomResponse {

    private Long id;
    private String code;
    private String name;
    private Long diagramId;
    private DiagramResponse diagram;
    private Instant createdAt;
}
