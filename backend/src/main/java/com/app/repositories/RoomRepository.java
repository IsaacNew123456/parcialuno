package com.app.repositories;

import com.app.entities.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface RoomRepository extends JpaRepository<Room, Long> {

    Optional<Room> findByCode(String code);

    Optional<Room> findByCodeIgnoreCase(String code);

    boolean existsByCodeIgnoreCase(String code);

    Optional<Room> findByDiagramId(Long diagramId);
}
